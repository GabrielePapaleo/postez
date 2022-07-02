import * as fs from 'fs';
import * as prettier from 'prettier';
import { EOL } from 'os';
import { IDatabase } from 'pg-promise';
import { IClient } from 'pg-promise/typescript/pg-subset';

import pg from './db';

import { IEnumSchema, ITypesSchema } from './types';
import { parseTableNames, getEnums, parseEnumTypes, parseInterfaces, parseCustomType } from './parsers';

export const defaultSchema: ITypesSchema = {
  string: [
    'bpchar',
    'char',
    'varchar',
    'text',
    'citext',
    'uuid',
    'bytea',
    'inet',
    'time',
    'timetz',
    'interval',
    'name',
  ],
  number: ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid'],
  boolean: ['bool', 'boolean'],
  Date: ['date', 'timestamp', 'timestamptz'],
  'Array<number>': ['_int2', '_int4', '_int8', '_float4', '_float8', '_numeric', '_money'],
  'Array<boolean>': ['_bool', '_boolean'],
  'Array<string>': ['_varchar', '_text', '_citext', '_uuid', '_bytea'],
  Object: ['json', 'jsonb'],
  'Array<Object>': ['_json', '_jsonb'],
  'Array<Date>': ['_timestamptz'],
  CustomTypes: [
    {
      name: 'point',
      type: 'Coordinates',
      definition: 'export interface Coordinates { x: number; y: number; }',
    },
  ],
};

export function sanitizeName(name: string, prefix: string = '', splitters: string[] = ['_', '-']) {
  return name
    .split(new RegExp(splitters.join('|')))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
    .replace(/^/, `${prefix}`);
}

export function generateEnumMap(enums: IEnumSchema[]) {
  return enums.reduce((acc: Map<string, string[]>, curr) => {
    acc.set(curr.enum_name, curr.enum_value.split(','));
    return acc;
  }, new Map());
}

export async function writeToFile(path: string, content: string[], name: string) {
  if (!fs.existsSync(path)) fs.mkdirSync(path);
  const _path = path + `/${name}.ts`;

  fs.writeFileSync(
    _path,
    prettier.format(content.join(EOL), { ...(await prettier.resolveConfig(path)), filepath: _path }),
  );
}

/**
 * Creates a file containing all database entities and their respective interfaces
 * @param {IDatabase<unknown, IClient>} db
 * @param {string} outputPath
 * @param {ITypesSchema} schema
 * @void will write a file to the outputPath
 */
export async function main(db: IDatabase<unknown, IClient>, outputPath: string, schema: ITypesSchema = defaultSchema) {
  const tables = await parseTableNames(db, pg.sql('select-table-names'));
  const views = await parseTableNames(db, pg.sql('select-view-names'));
  const enums = await getEnums(db, pg.sql('select-enum-names'));

  const _enums = await parseEnumTypes(enums);
  const _interfaces = (
    await parseInterfaces(db, tables, pg.sql('select-table-information'), generateEnumMap(enums), schema)
  ).concat(await parseInterfaces(db, views, pg.sql('select-table-information'), generateEnumMap(enums), schema));
  const _customTypes = parseCustomType(schema);

  try {
    await writeToFile(outputPath, _enums.concat(_customTypes, _interfaces), 'types');
    console.info('Succesfully generated files in:', outputPath);
  } catch (error) {
    console.error(error);
  }
}
