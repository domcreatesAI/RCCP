import client from './client'

export interface DbConfig {
  server: string
  can_edit: boolean
}

export async function getDbConfig(): Promise<DbConfig> {
  const { data } = await client.get<DbConfig>('/db-config')
  return data
}

export async function testDbConfig(server: string): Promise<{ ok: true; server: string }> {
  const { data } = await client.post<{ ok: true; server: string }>('/db-config/test', { server })
  return data
}

export async function updateDbConfig(server: string): Promise<{ server: string }> {
  const { data } = await client.put<{ server: string }>('/db-config', { server })
  return data
}
