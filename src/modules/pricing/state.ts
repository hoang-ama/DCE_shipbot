import {
  calculateDCExpressPriceFromShippingInfo,
  DEFAULT_STANDARD_ROUTES,
  StandardPriceRoute,
  formatVnd,
} from './engine';

export const pricingState = {
  activeStandardRoutes: [...DEFAULT_STANDARD_ROUTES] as StandardPriceRoute[],
};
