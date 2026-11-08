import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

try {
  process.loadEnvFile(join(__dirname, '..', '..', '..', '.env'));
} catch {
  /* .env opcional */
}

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors();
  app.enableShutdownHooks();
  const config = new DocumentBuilder()
    .setTitle('Puntos de recarga — API v1')
    .setDescription('Mapa unificado de puntos de recarga públicos (España + Europa)')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.API_PORT ?? 3000);
  // 0.0.0.0 para que el móvil (Expo Go) alcance la API por la red local.
  await app.listen(port, '0.0.0.0');
  console.log(`API escuchando en http://localhost:${port} — documentación en /docs`);
}

if (require.main === module) {
  bootstrap();
}
