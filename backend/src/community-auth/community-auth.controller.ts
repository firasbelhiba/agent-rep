import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CommunityAuthService } from './community-auth.service';

@Controller('community-auth')
export class CommunityAuthController {
  constructor(private readonly authService: CommunityAuthService) {}

  // ---- Wallet Signature Verification Flow ----

  /**
   * Step 1: Request a challenge to sign.
   * The frontend sends the wallet address, gets back a challenge string + nonce.
   */
  @Get('challenge')
  @Throttle({ default: { ttl: 60000, limit: 30 } }) // 30 per minute
  getChallenge(@Query('walletAddress') walletAddress: string) {
    if (!walletAddress) {
      throw new HttpException('walletAddress query parameter is required', HttpStatus.BAD_REQUEST);
    }

    const { challenge, nonce } = this.authService.generateChallenge(walletAddress);
    return { challenge, nonce };
  }

  /**
   * Step 2: Verify the signed challenge.
   * Frontend sends the signed message, backend verifies against the on-chain public key.
   * Returns JWT on success. Creates user account if first time.
   */
  @Post('verify-wallet')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async verifyWallet(
    @Body()
    body: {
      walletAddress: string;
      nonce: string;
      signature: string; // hex-encoded signature
      publicKey: string; // hex-encoded public key from wallet
      displayName?: string; // required for new users
    },
  ) {
    const { walletAddress, nonce, signature, publicKey, displayName } = body;

    if (!walletAddress || !nonce || !signature || !publicKey) {
      throw new HttpException(
        'walletAddress, nonce, signature, and publicKey are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { user, token, isNewUser } = await this.authService.verifyWalletSignature(
      walletAddress,
      nonce,
      signature,
      publicKey,
      displayName || '',
    );

    return {
      user: {
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        feedbackCount: user.feedbackCount,
        createdAt: user.createdAt,
      },
      token,
      isNewUser,
      verified: true,
    };
  }

  // ---- Legacy Password Auth (fallback for dev/testing) ----

  /**
   * Register with wallet address + password (legacy, no wallet verification).
   */
  @Post('register')
  @Throttle({ default: { ttl: 3600000, limit: 10 } })
  async register(
    @Body() body: { walletAddress: string; displayName: string; password: string },
  ) {
    const { walletAddress, displayName, password } = body;

    if (!walletAddress || !displayName || !password) {
      throw new HttpException(
        'walletAddress, displayName, and password are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { user, token } = await this.authService.register(
      walletAddress,
      displayName,
      password,
    );

    return {
      user: {
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  /**
   * Login with wallet address + password (legacy).
   */
  @Post('login')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  async login(
    @Body() body: { walletAddress: string; password: string },
  ) {
    const { walletAddress, password } = body;

    if (!walletAddress || !password) {
      throw new HttpException(
        'walletAddress and password are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { user, token } = await this.authService.login(walletAddress, password);

    return {
      user: {
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        feedbackCount: user.feedbackCount,
      },
      token,
    };
  }

  /**
   * Verify token and return user profile.
   */
  @Get('me')
  async me(@Headers('authorization') authHeader: string | undefined) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing Authorization header', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = await this.authService.verifyToken(token);
    const user = await this.authService.getUser(payload.walletAddress);

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      user: {
        walletAddress: user.walletAddress,
        displayName: user.displayName,
        feedbackCount: user.feedbackCount,
        createdAt: user.createdAt,
      },
    };
  }
}
