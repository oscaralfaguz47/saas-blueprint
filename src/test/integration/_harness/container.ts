import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

/**
 * Ephemeral Postgres with pgvector (required by migrations — same prerequisite as production).
 * Host port is always mapped dynamically; never assume 5432 on the host.
 */
export async function startPostgresContainer(): Promise<{
  container: StartedPostgreSqlContainer;
  connectionString: string;
}> {
  const container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
    .withDatabase("relitrue_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  return {
    container,
    connectionString: container.getConnectionUri(),
  };
}

export async function stopPostgresContainer(
  container: StartedPostgreSqlContainer
): Promise<void> {
  await container.stop();
}
