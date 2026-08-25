import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migrationsDirectory = resolve(root, "supabase/migrations");
const schemaPath = resolve(root, "supabase/schema.sql");
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));
const migrations = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDirectory, file), "utf8"))
  .join("\n");
const schema = readFileSync(schemaPath, "utf8");

function objectNames(source, expression) {
  return new Set(Array.from(source.matchAll(expression), (match) => match[1].toLowerCase()));
}

function assertObjectCoverage(label, expected, actual, errors) {
  const missing = [...expected].filter((name) => !actual.has(name)).sort();
  if (missing.length > 0) errors.push(`${label} absents de schema.sql : ${missing.join(", ")}`);
}

function normalizeFunction(definition) {
  return definition.toLowerCase().replace(/\s+/g, "");
}

function normalizeSql(source) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function functionDefinitions(source) {
  const definitions = new Map();
  const expression = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\$\$\s*;/gi;
  for (const match of source.matchAll(expression)) {
    definitions.set(match[1].toLowerCase(), normalizeFunction(match[0]));
  }
  return definitions;
}

function canonicalMigrationFunction(name, definition) {
  if (name !== "merge_contacts" && name !== "merge_contacts_with_addresses") return definition;
  return definition.replace(
    "updatepublic.pipeline_historysetcontact_id=p_target_idwherecontact_id=p_source_id;",
    "",
  );
}

function validateSqlBalance(source, errors) {
  let parentheses = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];
    if (character === "-" && nextCharacter === "-") {
      const lineEnd = source.indexOf("\n", index + 2);
      index = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }
    if (character === "'") {
      let closed = false;
      for (index += 1; index < source.length; index += 1) {
        if (source[index] !== "'") continue;
        if (source[index + 1] === "'") {
          index += 1;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) errors.push("Chaîne SQL simple non terminée dans schema.sql");
      continue;
    }
    if (character === '"') {
      let closed = false;
      for (index += 1; index < source.length; index += 1) {
        if (source[index] !== '"') continue;
        if (source[index + 1] === '"') {
          index += 1;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) errors.push("Identifiant SQL entre guillemets non terminé dans schema.sql");
      continue;
    }
    if (character === "$") {
      const delimiter = source.slice(index).match(/^\$[a-z0-9_]*\$/i)?.[0];
      if (delimiter) {
        const closing = source.indexOf(delimiter, index + delimiter.length);
        if (closing === -1) {
          errors.push(`Bloc SQL ${delimiter} non terminé dans schema.sql`);
          break;
        }
        index = closing + delimiter.length - 1;
        continue;
      }
    }
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses -= 1;
    if (parentheses < 0) {
      errors.push("Parenthèse fermante sans ouverture dans schema.sql");
      break;
    }
  }
  if (parentheses !== 0) errors.push(`Parenthèses SQL déséquilibrées dans schema.sql : ${parentheses}`);
}

const errors = [];
validateSqlBalance(schema, errors);
const expectedTables = objectNames(migrations, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi);
const expectedExtensions = objectNames(migrations, /create\s+extension\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi);
const expectedIndexes = objectNames(migrations, /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi);
const expectedTriggers = objectNames(migrations, /create\s+trigger\s+([a-z0-9_]+)/gi);
const expectedRlsTables = objectNames(migrations, /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi);
const actualTables = objectNames(schema, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi);
const actualExtensions = objectNames(schema, /create\s+extension\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi);
const actualIndexes = objectNames(schema, /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi);
const actualTriggers = objectNames(schema, /create\s+trigger\s+([a-z0-9_]+)/gi);
const actualRlsTables = objectNames(schema, /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi);

assertObjectCoverage("Tables", expectedTables, actualTables, errors);
assertObjectCoverage("Extensions", expectedExtensions, actualExtensions, errors);
assertObjectCoverage("Index", expectedIndexes, actualIndexes, errors);
assertObjectCoverage("Triggers", expectedTriggers, actualTriggers, errors);
assertObjectCoverage("Protections RLS", expectedRlsTables, actualRlsTables, errors);

const removedObjects = [
  "pipeline_history",
  "contacts_buyer_pipeline_idx",
  "contacts_seller_pipeline_idx",
  "pipeline_history_contact_idx",
  "update_pipeline_stage",
];
for (const name of removedObjects) {
  const stillDefined = new RegExp(`(?:table|index|function)\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${name}\\b`, "i").test(schema);
  if (stillDefined) errors.push(`Objet supprimé encore défini dans schema.sql : ${name}`);
}

const migrationFunctions = functionDefinitions(migrations);
const schemaFunctions = functionDefinitions(schema);
const schemaFunctionCounts = new Map();
for (const match of schema.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)) {
  const name = match[1].toLowerCase();
  schemaFunctionCounts.set(name, (schemaFunctionCounts.get(name) ?? 0) + 1);
}
for (const [name, count] of schemaFunctionCounts) {
  if (count !== 1) errors.push(`Fonction définie ${count} fois dans schema.sql : ${name}`);
}
for (const [name, migrationDefinition] of migrationFunctions) {
  const definition = canonicalMigrationFunction(name, migrationDefinition);
  if (!schemaFunctions.has(name)) {
    errors.push(`Fonction absente de schema.sql : ${name}`);
  } else if (schemaFunctions.get(name) !== definition) {
    errors.push(`Fonction non canonique dans schema.sql : ${name}`);
  }
}

for (const type of [
  "broker_assignment",
  "calendar_sync_status",
  "client_type",
  "contact_priority",
  "contact_source",
  "contact_status",
]) {
  if (!new RegExp(`create\\s+type\\s+public\\.${type}\\s+as\\s+enum`, "i").test(schema)) {
    errors.push(`Type PostgreSQL absent de schema.sql : ${type}`);
  }
}

const normalizedSchema = normalizeSql(schema);
for (const fragment of [
  "foreign key (listing_id) references public.listings(id) on delete restrict",
  "foreign key (offer_id) references public.listing_offers(id) on delete restrict",
  "foreign key (transaction_id) references public.transactions(id) on delete restrict",
  "grant select, insert, update, delete on public.contact_addresses to service_role",
  "grant select, insert, update, delete on public.listing_offers, public.listing_transaction_links to service_role",
  "grant select, insert on public.listing_activity, public.listing_price_history to service_role",
  "revoke execute on function public.complete_listing_sale(uuid,numeric,date,text,boolean,public.broker_assignment) from public, anon, authenticated, service_role",
]) {
  if (!normalizedSchema.includes(normalizeSql(fragment))) {
    errors.push(`État final absent de schema.sql : ${fragment}`);
  }
}
if (/constraint\s+listing_transaction_links_listing_unique/i.test(schema)) {
  errors.push("Ancienne unicité Listing → Transaction encore présente dans schema.sql");
}

const forbiddenPatterns = [
  [/cron\.|pg_cron|scheduler|automatic_email_runner/i, "mécanisme d’envoi automatique"],
  [/(service_role|supabase|google).{0,30}(secret|token|password)\s*=/i, "secret potentiel"],
];
for (const [pattern, label] of forbiddenPatterns) {
  if (pattern.test(schema)) errors.push(`${label} détecté dans schema.sql`);
}

if (errors.length > 0) {
  console.error("Incohérences Supabase détectées :");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Schéma Supabase cohérent : ${migrationFiles.length} migrations, ${expectedTables.size} tables, `
    + `${expectedIndexes.size} index, ${migrationFunctions.size} fonctions et ${expectedTriggers.size} triggers vérifiés.`,
);
