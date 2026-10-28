import { useEffect, useState } from 'react';

import { AppButton, AppInput, AppText } from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import {
    CURRENCIES,
    RATE_ANCHOR,
    getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { parseAmount } from '@/features/finance/utils/money';
import { refreshLiveRates } from '@/services/liveRates';
import { moduleColors } from '@/theme';

interface RatesModalProps {
  visible: boolean;
  onClose: () => void;
}

const EDITABLE = CURRENCIES.filter((c) => c.code !== RATE_ANCHOR);

const showRate = (value: number): string => String(Number(value.toFixed(4)));
const showMetal = (value: number | null): string =>
  value === null ? '' : String(Number(value.toFixed(2)));

/** Live rates (when online) plus manual editing of every rate. */
export function RatesModal({ visible, onClose }: RatesModalProps) {
  const rates = useCurrencyStore((s) => s.rates);
  const metals = useCurrencyStore((s) => s.metals);
  const updatedAt = useCurrencyStore((s) => s.updatedAt);
  const source = useCurrencyStore((s) => s.source);
  const setRate = useCurrencyStore((s) => s.setRate);
  const setMetalPrice = useCurrencyStore((s) => s.setMetalPrice);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setMessage(undefined);
    setError(undefined);
  }, [visible]);

  // Reload the fields when the modal opens or new rates arrive.
  useEffect(() => {
    if (!visible) return;
    const state = useCurrencyStore.getState();
    const initial: Record<string, string> = {};
    EDITABLE.forEach((c) => {
      initial[c.code] = showRate(state.rates[c.code] ?? 0);
    });
    setDrafts(initial);
    setGold(showMetal(state.metals.gold24PerGram));
    setSilver(showMetal(state.metals.silverPerGram));
  }, [visible, updatedAt]);

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    const result = await refreshLiveRates();
    setLoading(false);
    if (result.ok) {
      setMessage(result.message);
    } else {
      setMessage(undefined);
      setError(result.message);
    }
  };

  const save = () => {
    const parsed: Record<string, number> = {};
    for (const c of EDITABLE) {
      const value = parseAmount(drafts[c.code] ?? '');
      if (value === null || value <= 0) {
        setError(`Enter a valid rate for ${c.code}.`);
        return;
      }
      parsed[c.code] = value;
    }

    const goldValue = gold.trim() === '' ? null : parseAmount(gold);
    const silverValue = silver.trim() === '' ? null : parseAmount(silver);
    if (gold.trim() !== '' && (goldValue === null || goldValue <= 0)) {
      setError('Enter a valid gold price.');
      return;
    }
    if (silver.trim() !== '' && (silverValue === null || silverValue <= 0)) {
      setError('Enter a valid silver price.');
      return;
    }

    // Only touch what actually changed, so live rates are not marked "manual".
    EDITABLE.forEach((c) => {
      const current = Number((rates[c.code] ?? 0).toFixed(4));
      if (parsed[c.code] !== current) setRate(c.code, parsed[c.code]);
    });
    if (
      goldValue !== null &&
      goldValue !== Number((metals.gold24PerGram ?? 0).toFixed(2))
    ) {
      setMetalPrice('gold24PerGram', goldValue);
    }
    if (
      silverValue !== null &&
      silverValue !== Number((metals.silverPerGram ?? 0).toFixed(2))
    ) {
      setMetalPrice('silverPerGram', silverValue);
    }
    onClose();
  };

  const status =
    source === 'default' || !updatedAt
      ? 'Using default placeholder rates.'
      : `Last update (${source}): ${updatedAt.slice(0, 16).replace('T', ' ')} UTC`;

  return (
    <FormModal visible={visible} title="Exchange rates" onClose={onClose}>
      <AppText variant="caption" color="textSecondary">
        {status}
      </AppText>

      <AppButton
        title="Update from internet"
        accentColor={moduleColors.finance}
        loading={loading}
        onPress={() => void refresh()}
      />

      {message ? (
        <AppText variant="caption" color="success">
          {message}
        </AppText>
      ) : null}

      <AppText variant="label" color="textSecondary">
        CURRENCIES (VALUE IN {RATE_ANCHOR})
      </AppText>

      {EDITABLE.map((c) => (
        <AppInput
          key={c.code}
          label={`1 ${getCurrencyLabel(c.code)} =`}
          value={drafts[c.code] ?? ''}
          onChangeText={(text) =>
            setDrafts((prev) => ({ ...prev, [c.code]: text }))
          }
          keyboardType="decimal-pad"
          rightElement={<AppText color="textSecondary">{RATE_ANCHOR}</AppText>}
        />
      ))}

      <AppText variant="label" color="textSecondary">
        METALS (PRICE PER GRAM IN {RATE_ANCHOR})
      </AppText>

      <AppInput
        label="Gold 24K, 1 gram ="
        value={gold}
        onChangeText={setGold}
        keyboardType="decimal-pad"
        placeholder="not set"
        hint="Other karats are calculated from this. Local market prices are usually higher than spot."
        rightElement={<AppText color="textSecondary">{RATE_ANCHOR}</AppText>}
      />
      <AppInput
        label="Silver, 1 gram ="
        value={silver}
        onChangeText={setSilver}
        keyboardType="decimal-pad"
        placeholder="not set"
        rightElement={<AppText color="textSecondary">{RATE_ANCHOR}</AppText>}
      />

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title="Save rates"
        variant="secondary"
        onPress={save}
      />

      <AppText variant="caption" color="textSecondary">
        Currency rates by Exchange Rate API (exchangerate-api.com), updated about
        once a day. Gold and silver spot prices by gold-api.com.
      </AppText>
    </FormModal>
  );
}