The authorization and communication schema:

     AI Agent
                         │
                        MCP
                         ▼
                 ┌───────────────┐
                 │   MCP Server  │
                 └───────┬───────┘
                         │
              ┌──────────┴──────────┐
              │                     │
          App Tools            DB Resources
              │                     │
              ▼                     ▼
       Command Layer        PostgreSQL MCP
                                    │
                                    ▼
                             AI-facing schema
                                    │
                                    ▼
                              User-scoped data

                              