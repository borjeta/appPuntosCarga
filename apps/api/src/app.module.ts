import { Module } from '@nestjs/common';
import { CommunityController } from './community/community.controller';
import { CommunityService } from './community/community.service';
import { DbModule } from './db.module';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { OsrmRouting, PhotonGeocoder } from '@pc/planner';
import { RoutesController } from './routes/routes.controller';
import { GEOCODER, ROUTING, RoutesService } from './routes/routes.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';

@Module({
  imports: [DbModule],
  controllers: [LocationsController, VehiclesController, RoutesController, CommunityController],
  providers: [
    LocationsService,
    CommunityService,
    VehiclesService,
    RoutesService,
    { provide: ROUTING, useFactory: () => new OsrmRouting(process.env.ROUTING_URL || undefined) },
    {
      provide: GEOCODER,
      useFactory: () => new PhotonGeocoder(process.env.GEOCODER_URL || undefined),
    },
  ],
})
export class AppModule {}
