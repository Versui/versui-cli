export interface Resource {
  path: string
  blob_id: string
  blob_hash: string
  content_type: string
  size: number
  headers?: Record<string, string>
}

export interface DeploymentManifest {
  version: number
  site_id: string
  deployed_at: string
  resources: Record<string, Resource>
}

export interface VersuiConfig {
  network: 'testnet' | 'mainnet'
  sui: {
    rpc: string[]
  }
  walrus: {
    aggregators: string[]
    epochs: number
  }
  ignore: string[]
  headers?: Record<string, Record<string, string>>
}

export interface DeployOptions {
  domain?: string
  epochs?: number
  output?: string
  network?: 'testnet' | 'mainnet'
  noDelta?: boolean
}
