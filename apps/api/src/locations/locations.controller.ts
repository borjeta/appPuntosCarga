import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  parseBBox,
  parseFilters,
  type DataSourceInfo,
  type LocationDetail,
  type MapResponse,
  type NearbyResponse,
  type OperatorListItem,
  type QueryLike,
  type SearchResponse,
} from '@pc/shared';
import { CommunityService } from '../community/community.service';
import { LocationsService } from './locations.service';

function numberParam(raw: string | undefined, name: string, min: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n) || n < min || n > max) {
    throw new BadRequestException(`Parámetro "${name}" inválido (entre ${min} y ${max})`);
  }
  return n;
}

function optionalNumber(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const FILTER_QUERY_DOCS = [
  {
    name: 'connectors',
    required: false,
    description: 'Grupos: CCS2,TYPE2,CHADEMO,SCHUKO,TYPE1,CCS1,OTHER',
  },
  { name: 'minPowerKw', required: false },
  {
    name: 'operators',
    required: false,
    description: 'Party IDs separados por coma, p. ej. ES*IBD',
  },
  {
    name: 'payment',
    required: false,
    description: 'AD_HOC_CARD,OPERATOR_APP,RFID,QR,PLUG_AND_CHARGE',
  },
  { name: 'onlyAvailable', required: false },
  { name: 'open24h', required: false },
];
const DocFilters = () => (target: object, key: string, desc: PropertyDescriptor) => {
  for (const q of FILTER_QUERY_DOCS) ApiQuery(q)(target, key, desc);
};

@ApiTags('v1')
@Controller('v1')
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly community: CommunityService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Estado de la API y de la base de datos' })
  async health() {
    return { status: 'ok', db: await this.locations.ping() };
  }

  @Get('map')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Estaciones o grupos visibles en un recuadro del mapa' })
  @ApiQuery({
    name: 'bbox',
    description: 'oeste,sur,este,norte (WGS84)',
    example: '-3.8,40.35,-3.6,40.5',
  })
  @ApiQuery({ name: 'zoom', example: 12 })
  @DocFilters()
  map(@Query() query: QueryLike & { bbox?: string; zoom?: string }): Promise<MapResponse> {
    const bbox = parseBBox(query.bbox);
    if (!bbox) throw new BadRequestException('Parámetro "bbox" inválido: oeste,sur,este,norte');
    const zoom = Math.floor(numberParam(query.zoom, 'zoom', 0, 22));
    return this.locations.map(bbox, zoom, parseFilters(query));
  }

  @Get('locations/nearby')
  @ApiOperation({ summary: 'Estaciones cercanas ordenadas por distancia' })
  @ApiQuery({ name: 'lat', example: 40.4168 })
  @ApiQuery({ name: 'lng', example: -3.7038 })
  @ApiQuery({ name: 'radiusKm', required: false, example: 5 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @DocFilters()
  nearby(
    @Query() query: QueryLike & { lat?: string; lng?: string; radiusKm?: string; limit?: string },
  ): Promise<NearbyResponse> {
    const lat = numberParam(query.lat, 'lat', -90, 90);
    const lng = numberParam(query.lng, 'lng', -180, 180);
    const radiusKm = optionalNumber(query.radiusKm, 0.1, 100) ?? 10;
    const limit = Math.floor(optionalNumber(query.limit, 1, 200) ?? 50);
    return this.locations.nearby(lat, lng, radiusKm * 1000, limit, parseFilters(query));
  }

  @Get('locations/:id')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Ficha completa de una estación' })
  async detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<LocationDetail> {
    const [location, community] = await Promise.all([
      this.locations.detail(id),
      this.community.summary(id),
    ]);
    if (!location) throw new NotFoundException('Estación no encontrada');
    return { ...location, community };
  }

  @Get('search')
  @ApiOperation({ summary: 'Busca estaciones (nombre, ciudad, calle) y operadores' })
  @ApiQuery({ name: 'q', example: 'malaga' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  search(@Query() query: { q?: string; lat?: string; lng?: string }): Promise<SearchResponse> {
    return this.locations.search(
      query.q ?? '',
      optionalNumber(query.lat, -90, 90),
      optionalNumber(query.lng, -180, 180),
    );
  }

  @Get('operators')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Operadores con número de estaciones' })
  @ApiQuery({ name: 'country', required: false, example: 'ES' })
  operators(@Query('country') country?: string): Promise<OperatorListItem[]> {
    const cc = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
    return this.locations.operators(cc);
  }

  @Get('sources')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({ summary: 'Fuentes de datos, licencias y atribuciones' })
  sources(): Promise<DataSourceInfo[]> {
    return this.locations.sources();
  }
}
