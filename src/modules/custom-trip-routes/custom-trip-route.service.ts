import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CreateCustomTripRouteDto,
  UpdateCustomTripRouteDto,
} from './custom-trip-route.dto';
import { CustomTripRoute } from './custom-trip-route.entity';

@Injectable()
export class CustomTripRouteService {
  constructor(
    @InjectRepository(CustomTripRoute)
    private readonly repo: Repository<CustomTripRoute>,
  ) {}

  // Return every saved route ordered by start name so the panel list
  // and the trip-form picker render predictably.
  async findAll(): Promise<CustomTripRoute[]> {
    return this.repo.find({ order: { startName: 'ASC', endName: 'ASC' } });
  }

  async findOne(id: string): Promise<CustomTripRoute> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Custom trip route ${id} not found`);
    }
    return row;
  }

  async create(dto: CreateCustomTripRouteDto): Promise<CustomTripRoute> {
    const row = this.repo.create(dto);
    return this.repo.save(row);
  }

  async update(
    id: string,
    dto: UpdateCustomTripRouteDto,
  ): Promise<CustomTripRoute> {
    const row = await this.findOne(id);
    Object.assign(row, dto);
    await this.repo.save(row);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Custom trip route ${id} not found`);
    }
  }
}
