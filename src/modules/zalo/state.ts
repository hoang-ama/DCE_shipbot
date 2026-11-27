import { liveZalo, tokenMode } from "../../config/env";
import path from 'path';
import { ROOT_DIR as __dirname } from '../../config/paths';

export const tokenState = {
  currentZaloAccessToken: liveZalo ? (process.env.ZALO_OA_ACCESS_TOKEN || '') : '',
  currentZaloRefreshToken: liveZalo && tokenMode === 'local_owner' ? (process.env.ZALO_REFRESH_TOKEN || '') : '',
  lastTokenRefreshTimestamp: Date.now(),
};

export const TOKEN_CACHE_FILE = path.resolve(__dirname, '.zalo_token.json');
