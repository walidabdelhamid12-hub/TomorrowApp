
import { RATE_ANCHOR } from '@/features/finance/constants/currencies';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance, roundMoney } from '@/features/finance/utils/finance';
import type { RateMap } from '@/features/finance/utils/money';
import { convertAmount } from '@/features/finance/utils/money';

/** Gold value in EGP from grams, karat and the 24K price per gram. */
export function getGoldValueEGP(
  grams: number,
  karat: number,
  gold24PerGram: number | null
): number | null {
  if (
    !Number.isFinite(grams) ||
    !Number.isFinite(karat) ||
    gold24PerGram === null ||
    !Number.isFinite(gold24PerGram) ||
    gold24PerGram <= 0 ||
    karat <= 0
  ) {
    return null;
  }

  return roundMoney(grams * (karat / 24) * gold24PerGram);
}

/** Silver value in EGP from grams and the silver price per gram. */
export function getSilverValueEGP(
  grams: number,
  silverPerGram: number | null
): number | null {
  if (
    !Number.isFinite(grams) ||
    silverPerGram === null ||
    !Number.isFinite(silverPerGram) ||
    silverPerGram <= 0
  ) {
    return null;
  }

  return roundMoney(grams * silverPerGram);
}

/** Convert an asset's value to the selected base currency. */
export function getAssetValueInBase(
  asset: Asset,
  baseCurrency: string,
  rates: RateMap,
  gold24PerGram: number | null,
  silverPerGram: number | null = null,
  verifiedCurrencies: readonly string[] = ['EGP']
): number | null {
  const balance = getAssetBalance(asset);

  if (!Number.isFinite(balance)) {
    return null;
  }

  if (asset.category === 'gold') {
    const egp = getGoldValueEGP(
      balance,
      asset.karat,
      gold24PerGram
    );

    return egp === null
      ? null
      : convertAmount(
          egp,
          RATE_ANCHOR,
          baseCurrency,
          rates,
          verifiedCurrencies
        );
  }

  if (asset.category === 'silver') {
    const egp = getSilverValueEGP(balance, silverPerGram);

    return egp === null
      ? null
      : convertAmount(
          egp,
          RATE_ANCHOR,
          baseCurrency,
          rates,
          verifiedCurrencies
        );
  }

  return convertAmount(
    balance,
    asset.currencyCode,
    baseCurrency,
    rates,
    verifiedCurrencies
  );
}
