import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DatabaseConnectionOptions = {
  database: string;
  host: string;
  password: string;
  username: string;
};

export function createDatabase(connection: string | DatabaseConnectionOptions) {
  const client =
    typeof connection === "string"
      ? postgres(connection, {
          max: 10,
          prepare: false,
        })
      : postgres({
          ...connection,
          max: 10,
          prepare: false,
        });

  return {
    client,
    database: drizzle(client, { schema }),
  };
}
