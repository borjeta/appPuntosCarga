import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isOneOf, REPORT_TYPES, type CommunitySummary } from '@pc/shared';
import { CommunityService, RateLimitError } from './community.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ApiTags('v1')
@Controller('v1/locations')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Post(':id/reports')
  @ApiOperation({ summary: 'Envía un aviso de la comunidad (funciona, averiado…)' })
  @ApiHeader({ name: 'x-device-id', description: 'UUID anónimo del dispositivo', required: true })
  @ApiBody({ schema: { example: { type: 'WORKS', comment: 'Cargó a 120 kW sin problema' } } })
  async create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() body: { type?: unknown; comment?: unknown },
  ): Promise<CommunitySummary> {
    if (!deviceId || !UUID.test(deviceId))
      throw new BadRequestException('Falta la cabecera x-device-id (UUID)');
    if (!isOneOf(REPORT_TYPES, body?.type)) {
      throw new BadRequestException(`"type" debe ser uno de: ${REPORT_TYPES.join(', ')}`);
    }
    try {
      const ok = await this.community.create(id, deviceId, body.type, body.comment);
      if (!ok) throw new NotFoundException('Estación no encontrada');
    } catch (err) {
      if (err instanceof RateLimitError)
        throw new HttpException(err.message, HttpStatus.TOO_MANY_REQUESTS);
      throw err;
    }
    return this.community.summary(id);
  }
}
