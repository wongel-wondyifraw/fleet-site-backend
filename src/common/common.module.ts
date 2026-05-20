import { Global, Module } from '@nestjs/common';

import { CalculatedService } from './calculated.service';

@Global()
@Module({
  providers: [CalculatedService],
  exports: [CalculatedService],
})
export class CommonModule {}
