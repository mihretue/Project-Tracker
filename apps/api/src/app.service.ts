import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo(): { name: string; version: string; description: string } {
    return {
      name: 'Tenant Project Tracker API',
      version: '0.1.0',
      description: 'Multi-tenant project tracking API with ETB budget tracking',
    };
  }
}
