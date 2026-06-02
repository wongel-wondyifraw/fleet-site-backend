import { Global, Module } from '@nestjs/common';

import { SiteScopeService } from './site-scope.service';

@Global()
@Module({
  providers: [SiteScopeService],
  exports: [SiteScopeService],
})
export class SiteScopeModule {}
