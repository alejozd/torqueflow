// scripts/generar-catalogos-nextpyme.mjs
// Uso: node scripts/generar-catalogos-nextpyme.mjs
// Lee las tablas maestras públicas de Nextpyme (https://developers.nextpyme.plus/docs/tables)
// y escribe:
//   src/modulos/factura-electronica/catalogos/municipios.json          (núcleo: DANE + nombre)
//   src/modulos/factura-electronica/proveedores/nextpyme/catalogos.json (código DIAN → ID Nextpyme)
// Volver a correrlo si Nextpyme cambia sus tablas.
import { mkdir, writeFile } from "node:fs/promises";

const URL_TABLAS = "https://developers.nextpyme.plus/docs/tables";
const html = await (await fetch(URL_TABLAS)).text();
const coincidencia = html.match(/data-page="([^"]*)"/);
if (!coincidencia) throw new Error(`No se encontraron las tablas en ${URL_TABLAS}`);

const decodificar = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const tablas = JSON.parse(decodificar(coincidencia[1])).props.tables;

const tabla = (nombre) => {
  const t = tablas.find((x) => x.database_name === nombre);
  if (!t) throw new Error(`Falta la tabla ${nombre}`);
  return t.content;
};
const porCodigo = (nombre) =>
  Object.fromEntries(tabla(nombre).map((r) => [String(r.code).trim(), r.id]));

const departamentos = Object.fromEntries(tabla("departments").map((d) => [d.id, d.name.trim()]));
const municipios = tabla("municipalities")
  .map((r) => ({ codigo: String(r.code).trim(), nombre: r.name.trim(), departamento: departamentos[r.department_id] ?? "" }))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));

const catalogos = {
  fuente: URL_TABLAS,
  municipios: porCodigo("municipalities"),
  tiposDocumentoIdentidad: porCodigo("type_document_identifications"),
  tributos: porCodigo("taxes"),
  unidades: porCodigo("unit_measures"),
  mediosPago: porCodigo("payment_methods"),
  formasPago: porCodigo("payment_forms"),
  responsabilidades: porCodigo("type_liabilities"),
  regimenes: porCodigo("type_regimes"),
  tiposOrganizacion: porCodigo("type_organizations"),
  conceptosNotaCredito: porCodigo("credit_note_discrepancy_responses"),
};

const raiz = "src/modulos/factura-electronica";
await mkdir(`${raiz}/catalogos`, { recursive: true });
await mkdir(`${raiz}/proveedores/nextpyme`, { recursive: true });
await writeFile(`${raiz}/catalogos/municipios.json`, JSON.stringify(municipios, null, 1) + "\n");
await writeFile(`${raiz}/proveedores/nextpyme/catalogos.json`, JSON.stringify(catalogos, null, 1) + "\n");
console.log(`Municipios: ${municipios.length}. Catálogos: ${Object.keys(catalogos).length - 1}.`);
