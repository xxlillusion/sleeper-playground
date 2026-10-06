/* Perspective bootstrap. One engine worker per page, one Table per dataset. */
import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import "@perspective-dev/viewer/dist/css/pro.css";
import "@perspective-dev/viewer/dist/css/pro-dark.css";
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";
import CLIENT_WASM from "@perspective-dev/client/dist/wasm/perspective-js.wasm?url";
import VIEWER_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";
import type { Client, Table, ColumnType } from "@perspective-dev/client";

export type Schema = Record<string, ColumnType>;
export type Row = Record<string, string | number | boolean | null>;

let clientP: Promise<Client> | undefined;
export function getClient(): Promise<Client> {
  return (clientP ??= (async () => {
    perspective.init_server(fetch(SERVER_WASM));
    perspective.init_client(fetch(CLIENT_WASM));
    await perspective_viewer.init_client(fetch(VIEWER_WASM));
    return perspective.worker();
  })());
}

const tables = new Map<string, Table>();
let gen = 0;

/** Create (or replace) the Table for a dataset. The previous Table is returned so the caller can delete it once the viewer has moved on. */
export async function putTable(name: string, schema: Schema, rows: Row[]): Promise<{ table: Table; tableName: string; old: Table | null }> {
  const client = await getClient();
  const old = tables.get(name) ?? null;
  const tableName = `${name}#${++gen}`;
  const table = await client.table(schema, { name: tableName });
  if (rows.length) await table.update(rows);
  tables.set(name, table);
  return { table, tableName, old };
}
export const getTable = (name: string) => tables.get(name) ?? null;

export async function tableToCsv(table: Table): Promise<string> {
  const v = await table.view();
  try { return await v.to_csv(); } finally { await v.delete(); }
}
