import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomTripRouteController } from './custom-trip-route.controller';
import { CustomTripRoute } from './custom-trip-route.entity';
import { CustomTripRouteService } from './custom-trip-route.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomTripRoute])],
  controllers: [CustomTripRouteController],
  providers: [CustomTripRouteService],
  exports: [CustomTripRouteService],
})
export class CustomTripRouteModule {}
