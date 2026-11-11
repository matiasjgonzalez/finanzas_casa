"""Prueba de punta a punta: la aplicación completa en un navegador real, como la usaría la familia.

Uso, desde la carpeta del proyecto:   .\\e2e.cmd            (o: .\\e2e.cmd --sin-compilar)

Qué hace:
  1. Prepara una base de datos de PRUEBA vacía (TEST_DATABASE_URL, que debe terminar en _test).
     Nunca toca la base de desarrollo ni la carpeta de comprobantes real.
  2. Compila el frontend y levanta la API en el puerto 8001 (no choca con dev.cmd).
  3. Abre Microsoft Edge (o Chrome) sin ventana y recorre todos los flujos con los tres roles.
  4. Al final verifica directamente en PostgreSQL que todo quedó guardado (los comprobantes
     también: van dentro de la base).

Si algo falla, se detiene, muestra qué paso falló y deja una captura en e2e/fallas/.
"""

import asyncio
import contextlib
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from collections.abc import Awaitable, Callable
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
FAILURES = Path(__file__).resolve().parent / "fallas"
sys.path.insert(0, str(BACKEND))

import websockets  # noqa: E402  (viene con uvicorn[standard])
from sqlalchemy import create_engine, func, select, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

API_PORT = 8001
DEBUG_PORT = 9223
BASE = f"http://127.0.0.1:{API_PORT}"
TODAY = date.today()

# Contraseñas solo de esta base de prueba (se borra al empezar cada recorrido).
SUPER_PASSWORD = "super-e2e-1"  # noqa: S105
ANA_PASSWORD = "ana-e2e-12"  # noqa: S105
LEO_PASSWORD = "leo-e2e-12"  # noqa: S105

# PNG de 1x1 y PDF mínimos: lo justo para que pasen la validación del contenido real.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)
PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def say(text: str) -> None:
    print(text, flush=True)


def fail(text: str) -> None:
    say(f"\n  ERROR: {text}\n")
    raise SystemExit(1)


# --- Preparación ---------------------------------------------------------------------------


def port_free(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def test_database_url() -> str:
    from app.core.config import get_settings

    url = get_settings().test_database_url
    if not url or not (make_url(url).database or "").endswith("_test"):
        fail("TEST_DATABASE_URL tiene que apuntar a una base cuyo nombre termine en _test.")
    return url


def reset_database(url: str) -> None:
    """Base de prueba vacía, con todas las migraciones y el superadmin inicial (admin/admin)."""
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
        check=True,
        capture_output=True,
    )
    from app.cli import create_admin

    @contextlib.contextmanager
    def factory():  # noqa: ANN202
        with Session(engine) as db:
            yield db

    with contextlib.redirect_stdout(open(os.devnull, "w")):  # noqa: SIM115
        assert create_admin(factory, use_default=True) == 0
    engine.dispose()


def find_browser() -> str:
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    fail("No se encontró Microsoft Edge ni Google Chrome.")
    return ""


def wait_http(url: str, seconds: int = 30) -> None:
    for _ in range(seconds * 4):
        with contextlib.suppress(OSError):
            urllib.request.urlopen(url, timeout=1)  # noqa: S310 - solo localhost
            return
        time.sleep(0.25)
    fail(f"No respondió {url}.")


# --- Navegador (protocolo de DevTools) -----------------------------------------------------


class Page:
    def __init__(self, ws: websockets.ClientConnection) -> None:
        self.ws = ws
        self.next_id = 0
        self.errors: list[str] = []

    async def send(self, method: str, **params: object) -> dict:
        self.next_id += 1
        msg_id = self.next_id
        await self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})
            self._event(msg)

    def _event(self, msg: dict) -> None:
        # Cualquier error de JavaScript o console.error en la página hace fallar el recorrido.
        if msg.get("method") == "Runtime.exceptionThrown":
            details = msg["params"]["exceptionDetails"]
            self.errors.append(
                details.get("exception", {}).get("description") or details.get("text")
            )
        elif msg.get("method") == "Runtime.consoleAPICalled" and msg["params"]["type"] == "error":
            text_ = " ".join(
                str(a.get("value", a.get("description", ""))) for a in msg["params"]["args"]
            )
            # Las respuestas 4xx esperadas (ej. contraseña incorrecta) no son errores de la app.
            if "Failed to load resource" not in text_:
                self.errors.append(text_)

    async def js(self, expression: str) -> object:
        r = await self.send(
            "Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True
        )
        if "exceptionDetails" in r:
            raise RuntimeError(
                r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"])
            )
        return r.get("result", {}).get("value")

    async def wait(self, expression: str, what: str, timeout: float = 10) -> None:
        for _ in range(int(timeout / 0.2)):
            if await self.js(expression):
                return
            await asyncio.sleep(0.2)
        raise AssertionError(f"No apareció: {what}")

    async def wait_text(self, text_: str, timeout: float = 10) -> None:
        await self.wait(
            f"document.body.innerText.includes({json.dumps(text_)})", f"«{text_}»", timeout
        )

    async def goto(self, path: str) -> None:
        await self.send("Page.navigate", url=BASE + path)
        await self.wait(
            "document.readyState === 'complete' && !!document.querySelector('#root > *')", path
        )
        await asyncio.sleep(0.4)

    async def path(self) -> str:
        return await self.js("location.pathname")  # type: ignore[return-value]

    async def wait_path(self, path: str) -> None:
        await self.wait(f"location.pathname === {json.dumps(path)}", f"la página {path}")

    async def field(self, label: str) -> str:
        """Expresión JS del campo asociado a una etiqueta."""
        # Por su etiqueta visible o, si no tiene, por su aria-label.
        return (
            f"((l => l ? document.getElementById(l.htmlFor) : document.querySelector("
            f"'[aria-label=' + JSON.stringify({json.dumps(label)}) + ']'))"
            f"([...document.querySelectorAll('label')].find(l => l.textContent.trim() === {json.dumps(label)})))"
        )

    async def fill(self, label: str, value: str) -> None:
        field = await self.field(label)
        await self.js(f"""(() => {{
            const el = {field};
            const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
              : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, {json.dumps(value)});
            el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {{ bubbles: true }}));
        }})()""")

    async def type(self, label: str, value: str) -> None:
        """Escribe tecla por tecla (como una persona), para probar el formato en vivo."""
        await self.js(f"({await self.field(label)}).focus()")
        for ch in value:
            await self.send("Input.insertText", text=ch)

    async def value(self, label: str) -> str:
        return await self.js(f"({await self.field(label)}).value")  # type: ignore[return-value]

    async def select(self, label: str, option: str) -> None:
        """Elige una opción: tocando su botón (grupo de opciones con ese nombre) o, si el campo
        es una lista desplegable, eligiéndola en la lista."""
        tile = await self.js(f"""(() => {{
            const group = [...document.querySelectorAll('[role=radiogroup]')].find(g =>
              document.getElementById(g.getAttribute('aria-labelledby'))?.textContent.trim() === {json.dumps(label)});
            if (!group) return false;
            const radio = [...group.querySelectorAll('[role=radio]')].find(r => r.textContent.trim() === {json.dumps(option)});
            if (!radio) throw new Error('No está la opción ' + {json.dumps(option)});
            radio.click();
            return true;
        }})()""")
        if not tile:
            field = await self.field(label)
            value = await self.js(
                f"[...({field}).options].find(o => o.textContent.trim() === {json.dumps(option)}).value"
            )
            await self.fill(label, value)  # type: ignore[arg-type]
        await asyncio.sleep(0.2)

    async def click(self, text_: str, selector: str = "button, a") -> None:
        found = await self.js(f"""(() => {{
            const el = [...document.querySelectorAll({json.dumps(selector)})]
              .find(b => b.textContent.trim() === {json.dumps(text_)} || b.getAttribute('aria-label') === {json.dumps(text_)});
            if (!el) return false;
            el.click();
            return true;
        }})()""")
        if not found:
            raise AssertionError(f"No se encontró el botón o enlace «{text_}»")

    async def set_files(self, selector: str, paths: list[str]) -> None:
        doc = await self.send("DOM.getDocument")
        node = await self.send("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector=selector)
        await self.send("DOM.setFileInputFiles", nodeId=node["nodeId"], files=paths)

    async def screenshot(self, name: str) -> Path:
        import base64

        FAILURES.mkdir(exist_ok=True)
        data = await self.send("Page.captureScreenshot", format="png")
        path = FAILURES / f"{name}.png"
        path.write_bytes(base64.b64decode(data["data"]))
        return path

    async def viewport(self, width: int, height: int, mobile: bool = False) -> None:
        await self.send(
            "Emulation.setDeviceMetricsOverride",
            width=width,
            height=height,
            deviceScaleFactor=2 if mobile else 1,
            mobile=mobile,
        )

    async def login(self, username: str, password: str, *, new_password: str | None = None) -> None:
        await self.send("Network.clearBrowserCookies")
        await self.goto("/login")
        await self.fill("Usuario", username)
        await self.fill("Contraseña", password)
        await self.click("Iniciar sesión")
        if new_password:
            await self.wait_path("/cambiar-contrasena")
            await self.fill("Contraseña actual", password)
            await self.fill("Nueva contraseña", new_password)
            await self.fill("Repetí la nueva contraseña", new_password)
            await self.click("Guardar y continuar")
        await self.wait(
            "!location.pathname.startsWith('/login') && !location.pathname.startsWith('/cambiar')",
            "el ingreso",
        )
        await asyncio.sleep(0.5)


# --- Los recorridos ------------------------------------------------------------------------


async def superadmin_creates_the_household(page: Page) -> None:
    await page.login("admin", "admin", new_password=SUPER_PASSWORD)
    await page.wait_path("/hogares")
    nav = await page.js(
        "[...document.querySelectorAll('aside nav a')].map(a => a.textContent.trim())"
    )
    assert nav == ["Hogares", "Seguridad", "Mi cuenta", "Ayuda"], f"El superadmin ve otras secciones: {nav}"
    await page.goto("/pagos")
    await page.wait_path("/hogares")  # no entra a los datos de un hogar
    await page.goto("/hogares/nuevo")
    await page.fill("Nombre del hogar", "Familia E2E")
    await page.fill("Nombre", "Ana E2E")
    await page.fill("Usuario", "ana")
    await page.fill("Contraseña inicial", "provisoria")
    await page.click("Crear hogar")
    await page.wait_text("Ana E2E")


async def admin_sets_up_the_catalog(page: Page) -> None:
    await page.login("ana", "provisoria", new_password=ANA_PASSWORD)
    await page.goto("/categorias")
    await page.wait_text("Tarjeta de crédito")

    async def open_category(name: str) -> None:
        await page.js(
            f"[...document.querySelectorAll('button[aria-expanded]')].find(b => b.textContent.trim().startsWith({json.dumps(name)})).click()"
        )
        await asyncio.sleep(0.4)

    async def add(category: str, placeholder: str, name: str, due: bool = False) -> None:
        # El botón "Agregar" de ESA categoría: el primero es el de elementos (si los usa) y el
        # último, el de tipos.
        which = "[0]" if placeholder != "Nuevo tipo" else ".at(-1)"
        await page.js(f"""(() => {{
            const trigger = [...document.querySelectorAll('[data-slot=accordion-trigger]')]
              .find(b => b.textContent.trim().startsWith({json.dumps(category)}));
            const item = trigger.closest('[data-slot=accordion-item]');
            [...item.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Agregar'){which}.click();
        }})()""")
        await page.wait(
            f"!!document.querySelector('input[aria-label=\"{placeholder}\"]')", placeholder
        )
        await page.js(f"document.querySelector('input[aria-label=\"{placeholder}\"]').focus()")
        for ch in name:
            await page.send("Input.insertText", text=ch)
        if due:
            await page.js(
                "[...document.querySelectorAll('label')].find(l => l.textContent.trim() === 'Tiene vencimiento').querySelector('button').click()"
            )
        await page.js(
            f"document.querySelector('input[aria-label=\"{placeholder}\"]').form.requestSubmit()"
        )
        await page.wait_text(f"Se agregó «{name}».")

    # Servicio → Luz, con vencimiento (variable, ya vencido hace 3 días)
    await open_category("Servicio")
    await add("Servicio", "Nuevo tipo", "Luz", due=True)
    await page.wait("!!document.querySelector('[role=dialog]')", "el panel de vencimiento")
    await page.js("document.querySelector('[role=dialog] button[role=switch]').click()")
    await asyncio.sleep(0.3)
    await page.fill("Fecha de vencimiento", (TODAY - timedelta(days=3)).isoformat())
    await page.select("Importe", "Variable (cambia cada vez)")
    await page.type("Importe estimado (opcional)", "45000")
    assert await page.value("Importe estimado (opcional)") == "45.000", (
        "El importe no se formatea al escribir"
    )
    await page.click("Guardar", "[role=dialog] button")
    await page.wait("!document.querySelector('[role=dialog]')", "el cierre del panel")
    await page.wait(
        "!!document.querySelector('button[aria-label=\"Luz (con vencimiento): opciones\"]')",
        "la marca de vencimiento",
    )

    # Auto → un auto y un tipo
    await open_category("Auto")
    await add("Auto", "Nuevo auto", "Fiat Cronos")
    await add("Auto", "Nuevo tipo", "Nafta")

    # Un integrante
    await page.goto("/administracion/usuarios/nuevo")
    await page.fill("Nombre", "Leo E2E")
    await page.fill("Usuario", "leo")
    await page.fill("Contraseña inicial", "provisoria")
    await page.click("Crear usuario")
    await page.wait_path("/administracion")
    await page.wait_text("Leo E2E")


async def admin_registers_payments(page: Page, files: dict[str, str]) -> None:
    await page.goto("/pagos/nuevo")
    await page.click("Guardar pago")
    await page.wait_text("Ingresá el importe.")
    await page.wait_text("Elegí una categoría.")
    await page.type("Importe", "10000")
    assert await page.value("Importe") == "10.000", "Faltan los puntos de miles al escribir"
    await page.js(f"({await page.field('Importe')}).blur()")
    await asyncio.sleep(0.2)
    assert await page.value("Importe") == "10.000,00", "No se completan los decimales al salir"
    await page.select("Categoría", "Auto")
    await page.select("Auto", "Fiat Cronos")
    await page.select("Tipo", "Nafta")
    await page.fill("Descripción (opcional)", "Carga de nafta E2E")
    await page.set_files("#comprobantes", [files["png"]])
    await asyncio.sleep(0.3)
    await page.click("Guardar pago")
    await page.wait("!location.pathname.endsWith('/nuevo')", "el guardado del pago")
    await page.goto("/pagos")
    await page.wait_text("Carga de nafta E2E")
    await page.wait_text("10.000,00")


async def member_permissions_and_due_date(page: Page, files: dict[str, str]) -> None:
    await page.login("leo", "provisoria", new_password=LEO_PASSWORD)
    nav = await page.js(
        "[...document.querySelectorAll('aside nav a')].map(a => a.textContent.trim())"
    )
    assert "Administración" not in str(nav), "Un integrante ve Administración"
    await page.goto("/administracion")
    await page.wait_text("Acceso restringido")
    status = await page.js("fetch('/api/users').then(r => r.status)")
    assert status == 403, f"La API dejó listar usuarios a un integrante ({status})"

    # Ve solo sus pagos: el de Ana no aparece, ni lo puede pedir a la API
    await page.goto("/pagos")
    await page.wait_text("No hay pagos para mostrar.")
    assert not await page.js("document.body.innerText.includes('Carga de nafta E2E')"), (
        "Un integrante ve los pagos de otra persona"
    )
    assert not await page.js("document.body.innerText.includes('Gastos del hogar')"), (
        "Un integrante ve la pestaña Gastos del hogar"
    )
    for url in ["/api/transactions?scope=household", "/api/reports/summary?scope=household"]:
        status = await page.js(f"fetch('{url}').then(r => r.status)")
        assert status == 403, f"La API le dio a un integrante los gastos del hogar ({url}: {status})"

    # Paga la luz (vencida hace 3 días) desde "Por pagar", con su botón "Pagar"
    await page.goto("/por-pagar")
    await page.wait_text("Vencidas (1)")
    await page.wait_text("Venció hace 3 días")
    await page.js(
        "[...document.querySelectorAll('main li')].find(li => li.textContent.includes('Luz'))"
        ".querySelector('a').click()"
    )
    await page.wait_text("Registrar el pago")
    await page.wait_text("Vencido")
    await page.fill("Importe", "")
    await page.type("Importe", "47250,5")
    await page.click("Registrar pago")
    await page.wait_text("Ver en Pagos")
    await page.wait_text("47.250,50")
    await page.set_files("input[type=file]", [files["pdf"]])
    await page.wait_text("factura.pdf")

    # El pago aparece en el calendario de pagos realizados
    await page.goto(f"/calendario/pagos?mes={TODAY:%Y-%m}")
    await page.wait_text("47.250,50")


async def budgets_home_and_reports(page: Page) -> None:
    await page.login("ana", ANA_PASSWORD)
    await page.goto("/presupuestos")
    await page.js(
        "document.querySelector('button[aria-label=\"Fijar presupuesto de Auto\"]').click()"
    )
    await page.type("Límite mensual para Auto", "8000")
    await page.click("Guardar")
    await page.wait_text("Superado")  # 10.000 gastado contra 8.000

    await page.goto("/")
    await page.wait_text("¿Qué querés hacer?")
    await page.wait_text("Cuentas para pagar pronto")
    await page.wait_text("10.000,00 este mes")  # solo lo de Ana: la nafta (la luz la pagó Leo)
    await page.goto("/gastos")
    await page.wait_text("gastaste")
    await page.wait_text("Auto")
    # En "Gastos del hogar", lo de todos: nafta 10.000 + luz 47.250,50
    await page.click("Gastos del hogar", "[role=tab]")
    await page.wait_text("el hogar gastó")
    await page.wait_text("57.250,50")
    await page.goto("/pagos")
    await page.wait_text("Exportar a Excel")
    csv = await page.js(
        "fetch('/api/reports/export.csv?date_from=" + f"{TODAY:%Y-%m}-01" + "').then(r => r.text())"
    )
    assert "Carga de nafta E2E" in csv and "10000,00" in csv, "La exportación CSV no trae los pagos"


async def mobile_and_dark_mode(page: Page) -> None:
    await page.viewport(390, 844, mobile=True)
    for path in [
        "/",
        "/pagos",
        "/pagos/nuevo",
        "/por-pagar",
        "/gastos",
        "/calendario",
        "/presupuestos",
        "/categorias",
        "/cuenta",
        "/ayuda",
    ]:
        await page.goto(path)
        # Se mide con los datos ya cargados: una fila larga puede ser la que desborde.
        await page.wait("!document.querySelector('[data-slot=skeleton]')", f"la carga de {path}")
        await asyncio.sleep(0.8)
        overflow = await page.js("document.documentElement.scrollWidth > window.innerWidth + 1")
        assert not overflow, f"En el celular, {path} se desborda a lo ancho"
    await page.viewport(1280, 900)
    # Sin haber elegido tema, arranca en oscuro (aunque el sistema esté en claro)…
    await page.send(
        "Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": "light"}]
    )
    await page.js("localStorage.removeItem('theme')")
    await page.goto("/")
    assert await page.js("document.documentElement.classList.contains('dark')"), (
        "No arranca en modo oscuro"
    )
    # …y el botón del menú cambia a claro, y se recuerda al recargar.
    await page.click("Tema claro", "aside button")
    await asyncio.sleep(0.3)
    await page.goto("/")
    assert not await page.js("document.documentElement.classList.contains('dark')"), (
        "No pasa a modo claro o no lo recuerda"
    )
    await page.send("Emulation.setEmulatedMedia", features=[])


async def superadmin_deactivates_the_household(page: Page) -> None:
    await page.login("admin", SUPER_PASSWORD)
    await page.goto("/hogares")
    # El panel muestra cada hogar con sus cuentas.
    await page.wait_text("Usuario: ana")
    await page.wait_text("Usuario: leo")
    # Panel de seguridad: los ingresos de la prueba, con su IP y su dispositivo.
    await page.goto("/seguridad")
    await page.wait_text("La app te ve con la IP 127.0.0.1")
    await page.wait_text("Intentos de ingreso")
    await page.wait_text("Edge en Windows")
    await page.goto("/hogares")
    await page.wait_text("Usuario: ana")
    await page.js("document.querySelector('a[aria-label=\"Gestionar Familia E2E\"]').click()")
    await page.wait("!!document.getElementById('hogar-activo')", "el detalle del hogar")
    await page.js("document.getElementById('hogar-activo').click()")
    await page.wait_text("se cerraron sus sesiones")
    # Ana ya no puede entrar
    await page.send("Network.clearBrowserCookies")
    await page.goto("/login")
    await page.fill("Usuario", "ana")
    await page.fill("Contraseña", ANA_PASSWORD)
    await page.click("Iniciar sesión")
    await page.wait_text("Usuario o contraseña incorrectos")
    # (este 401 es esperado)
    page.errors = [e for e in page.errors if "401" not in e]


def verify_database(url: str) -> list[str]:
    """Lo que la interfaz mostró, ¿quedó realmente guardado?"""
    from app.models import (
        Attachment,
        AuditLog,
        Budget,
        Household,
        Service,
        ServicePayment,
        StoredFile,
        Transaction,
        User,
    )
    from app.models.enums import ServicePaymentStatus

    engine = create_engine(url)
    problems = []
    with Session(engine) as db:
        household = db.scalars(select(Household).where(Household.name == "Familia E2E")).one()
        users = db.scalars(select(User).where(User.household_id == household.id)).all()
        checks = {
            "el hogar quedó desactivado": household.is_active is False,
            "el hogar tiene a Ana (admin) y a Leo": sorted(u.username for u in users)
            == ["ana", "leo"],
            "nadie quedó con contraseña provisoria": not any(u.must_change_password for u in users),
            "hay 2 pagos (la nafta y la luz)": db.scalar(select(func.count(Transaction.id))) == 2,
            "el vencimiento de la luz quedó pagado y vinculado a su pago": db.scalar(
                select(func.count(ServicePayment.id)).where(
                    ServicePayment.status == ServicePaymentStatus.PAID,
                    ServicePayment.transaction_id.is_not(None),
                    ServicePayment.amount_paid == 47250.50,
                )
            )
            == 1,
            "hay 1 vencimiento programado": db.scalar(select(func.count(Service.id))) == 1,
            "hay 1 presupuesto": db.scalar(select(func.count(Budget.id))) == 1,
            "hay 2 comprobantes": db.scalar(select(func.count(Attachment.id))) == 2,
        }
        for attachment in db.scalars(select(Attachment)):
            stored = db.get(StoredFile, attachment.storage_key)
            checks[f"el archivo de «{attachment.original_filename}» está guardado en la base"] = (
                stored is not None and hashlib.sha256(stored.data).hexdigest() == attachment.sha256
            )
        actions = set(db.scalars(select(AuditLog.action)))
        for action in [
            "household.created",
            "user.created",
            "service_period.paid",
            "budget.set",
            "household.updated",
        ]:
            checks[f"el historial registró «{action}»"] = action in actions
    engine.dispose()
    for description, ok in checks.items():
        say(f"    {'✓' if ok else '✗'} {description}")
        if not ok:
            problems.append(description)
    return problems


# --- Orquestación --------------------------------------------------------------------------


async def run_flows(files: dict[str, str]) -> None:
    with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json") as r:  # noqa: S310
        target = next(t for t in json.load(r) if t["type"] == "page")
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=50_000_000) as ws:
        page = Page(ws)
        for domain in ("Page", "Runtime", "DOM", "Network"):
            await page.send(f"{domain}.enable")
        await page.viewport(1280, 900)
        steps: list[tuple[str, Callable[[], Awaitable[None]]]] = [
            (
                "El superadmin crea un hogar (y no ve datos financieros)",
                lambda: superadmin_creates_the_household(page),
            ),
            (
                "La administradora arma categorías, vencimientos e integrantes",
                lambda: admin_sets_up_the_catalog(page),
            ),
            (
                "Carga un pago: obligatorios, formato del importe y comprobante",
                lambda: admin_registers_payments(page, files),
            ),
            (
                "Un integrante: permisos y pago de un vencimiento",
                lambda: member_permissions_and_due_date(page, files),
            ),
            ("Presupuesto, Inicio, gastos y exportación", lambda: budgets_home_and_reports(page)),
            ("Celular (sin desbordes) y modo oscuro", lambda: mobile_and_dark_mode(page)),
            (
                "El superadmin desactiva el hogar y corta el acceso",
                lambda: superadmin_deactivates_the_household(page),
            ),
        ]
        for number, (title, step) in enumerate(steps, 1):
            say(f"  {number}. {title}")
            try:
                await step()
            except Exception as error:  # noqa: BLE001
                shot = await page.screenshot(f"paso-{number}")
                say(f"     ✗ {error}")
                say(f"     Página: {await page.path()} · captura: {shot}")
                traceback.print_exc()
                raise SystemExit(1) from error
            if page.errors:
                fail(f"Errores en la consola del navegador: {page.errors}")
            say("     ✓")


def main() -> int:
    args = set(sys.argv[1:])
    say("\nPrueba de punta a punta — Casa en Orden\n")
    for port in (API_PORT, DEBUG_PORT):
        if not port_free(port):
            fail(f"El puerto {port} está ocupado (¿quedó otra prueba corriendo?).")
    url = test_database_url()
    say(f"  Base de prueba: {make_url(url).database}")

    if "--sin-compilar" not in args or not (FRONTEND / "dist" / "index.html").exists():
        say("  Compilando el frontend…")
        npm = shutil.which("npm") or fail("No se encontró npm.")
        subprocess.run(
            [npm, "run", "build"], cwd=FRONTEND, check=True, capture_output=True, shell=False
        )

    say("  Preparando la base de prueba…")
    reset_database(url)
    work = Path(tempfile.mkdtemp(prefix="ff-e2e-"))
    files = {"png": str(work / "ticket.png"), "pdf": str(work / "factura.pdf")}
    Path(files["png"]).write_bytes(PNG)
    Path(files["pdf"]).write_bytes(PDF)

    env = {**os.environ, "DATABASE_URL": url, "STORAGE_BACKEND": "database", "APP_ENV": "test"}
    api = subprocess.Popen(  # noqa: S603
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(API_PORT)],
        cwd=BACKEND,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=open(work / "api.log", "w"),  # noqa: SIM115
    )
    browser = subprocess.Popen(  # noqa: S603
        [
            find_browser(),
            "--headless=new",
            f"--remote-debugging-port={DEBUG_PORT}",
            f"--user-data-dir={work / 'navegador'}",
            "--no-first-run",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_http(f"{BASE}/api/health")
        wait_http(f"http://127.0.0.1:{DEBUG_PORT}/json")
        say("\n  Recorridos en el navegador:")
        asyncio.run(run_flows(files))
        say("\n  Verificación en PostgreSQL:")
        problems = verify_database(url)
        if problems:
            fail(f"{len(problems)} verificaciones fallaron.")
        say("\n  TODO OK: la aplicación funciona de punta a punta.\n")
        return 0
    finally:
        for proc in (browser, api):
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)  # noqa: S603, S607
        time.sleep(0.5)
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
