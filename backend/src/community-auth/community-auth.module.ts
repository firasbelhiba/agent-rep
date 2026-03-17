import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityUserEntity } from './community-user.entity';
import { CommunityAuthService } from './community-auth.service';
import { CommunityAuthController } from './community-auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CommunityUserEntity])],
  controllers: [CommunityAuthController],
  providers: [CommunityAuthService],
  exports: [CommunityAuthService],
})
export class CommunityAuthModule {}
