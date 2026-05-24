import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/user.entity';
import { SiteController } from './site.controller';
import { Site } from './site.entity';
import { SiteService } from './site.service';

@Module({
  // User repository is needed by SiteService to resolve assignee IDs.
  imports: [TypeOrmModule.forFeature([Site, User])],
  controllers: [SiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
