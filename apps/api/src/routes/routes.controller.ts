import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { GeocodeResult, LatLng, RoutePlan, RoutePlanRequest } from '@pc/shared';
import { VehiclesService } from '../vehicles/vehicles.service';
import { PlanError, RoutesService } from './routes.service';

function latLng(v: unknown, name: string): LatLng {
  const o = v as Partial<LatLng> | null;
  const lat = Number(o?.lat);
  const lng = Number(o?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BadRequestException(`"${name}" debe ser { lat, lng } válido`);
  }
  return { lat, lng };
}

function soc(v: unknown, name: string, fallback?: number): number {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new BadRequestException(`Falta "${name}"`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw new BadRequestException(`"${name}" debe estar entre 0 y 100`);
  return n;
}

@ApiTags('v1')
@Controller('v1')
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly vehicles: VehiclesService,
  ) {}

  @Post('routes/plan')
  @HttpCode(200)
  @ApiOperation({ summary: 'Planifica una ruta con paradas de carga para un vehículo' })
  @ApiBody({
    schema: {
      example: {
        origin: { lat: 40.4168, lng: -3.7038 },
        destination: { lat: 36.7213, lng: -4.4214 },
        vehicleId: 'fbffc80f-062d-ed16-d6df-5f621bb35848',
        startSoc: 90,
        arrivalMinSoc: 10,
      },
    },
  })
  async plan(@Body() body: Partial<RoutePlanRequest>): Promise<RoutePlan> {
    const req: RoutePlanRequest = {
      origin: latLng(body?.origin, 'origin'),
      destination: latLng(body?.destination, 'destination'),
      vehicleId: String(body?.vehicleId ?? ''),
      startSoc: soc(body?.startSoc, 'startSoc'),
      arrivalMinSoc: soc(body?.arrivalMinSoc, 'arrivalMinSoc', 10),
      stopMinSoc: soc(body?.stopMinSoc, 'stopMinSoc', 10),
      maxChargeSoc: soc(body?.maxChargeSoc, 'maxChargeSoc', 80),
      minPowerKw: Math.min(400, Math.max(0, Number(body?.minPowerKw ?? 50) || 0)),
    };
    if (req.maxChargeSoc! <= req.stopMinSoc!) {
      throw new BadRequestException('"maxChargeSoc" debe ser mayor que "stopMinSoc"');
    }
    const vehicle = await this.vehicles.byId(req.vehicleId);
    if (!vehicle) throw new NotFoundException('Modelo de vehículo no encontrado');
    try {
      return await this.routes.plan(req, vehicle);
    } catch (err) {
      if (err instanceof PlanError) throw new UnprocessableEntityException(err.message);
      throw new BadGatewayException(`Servicio de rutas no disponible: ${(err as Error).message}`);
    }
  }

  @Get('geocode')
  @ApiOperation({ summary: 'Busca lugares y direcciones (para origen/destino de rutas)' })
  @ApiQuery({ name: 'q', example: 'Málaga' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  async geocode(
    @Query('q') q = '',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<GeocodeResult[]> {
    const term = q.trim().slice(0, 100);
    if (term.length < 2) return [];
    const near =
      lat !== undefined &&
      lng !== undefined &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng))
        ? { lat: Number(lat), lng: Number(lng) }
        : null;
    try {
      return await this.routes.geocode(term, near);
    } catch (err) {
      throw new BadGatewayException(`Geocodificador no disponible: ${(err as Error).message}`);
    }
  }
}
