import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPool, type Pool } from '@pc/db';

export const PG_POOL = Symbol('PG_POOL');
export const InjectPool = () => Inject(PG_POOL);

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: (): Pool => createPool() }],
  exports: [PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@InjectPool() private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
