import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { VehicleSpec } from '@pc/shared';
import { VehiclesService } from './vehicles.service';

@ApiTags('v1')
@Controller('v1/vehicle-models')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Busca modelos de vehículo (Open EV Data)' })
  @ApiQuery({ name: 'q', required: false, example: 'tesla model 3' })
  @ApiQuery({ name: 'limit', required: false, example: 30 })
  search(@Query('q') q = '', @Query('limit') limit = '30'): Promise<VehicleSpec[]> {
    const n = Math.min(100, Math.max(1, Number(limit) || 30));
    return this.vehicles.search(q.slice(0, 80), n);
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Ficha técnica de un modelo' })
  async byId(@Param('id') id: string): Promise<VehicleSpec> {
    const v = await this.vehicles.byId(id.slice(0, 64));
    if (!v) throw new NotFoundException('Modelo no encontrado');
    return v;
  }
}
