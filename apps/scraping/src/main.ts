import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.SERVER_PORT ?? 3001;
  await app.listen(port);
  console.log(`Scraping service is running on port ${port}`);
}
bootstrap();
