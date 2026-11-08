import type { OperatorSummary } from '@pc/shared';
import { Alert, Linking, Platform } from 'react-native';
import i18n from './i18n';

async function openFirst(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      // canOpenURL falla con esquemas no declarados; intentamos abrir directamente y probamos el siguiente.
      await Linking.openURL(url);
      return;
    } catch {
      /* siguiente */
    }
  }
}

/** Ofrece abrir la ruta en Google Maps, Waze o la app de mapas del sistema. */
export function openDirections(lat: number, lng: number, label: string): void {
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const system =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`
      : `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`;

  if (Platform.OS === 'web') {
    void openFirst([google]);
    return;
  }
  Alert.alert(i18n.t('detail.chooseNav'), undefined, [
    { text: 'Google Maps', onPress: () => void openFirst([google]) },
    { text: 'Waze', onPress: () => void openFirst([waze]) },
    {
      text: Platform.OS === 'ios' ? 'Apple Maps' : i18n.t('detail.otherMapsApp'),
      onPress: () => void openFirst([system]),
    },
  ]);
}

/**
 * Abre la app del operador: deep link documentado → app instalada/tienda → búsqueda en la tienda.
 * Sin deep links documentados (fase 1) se busca por nombre comercial en la tienda.
 */
export function openOperatorApp(operator: OperatorSummary, evseId?: string | null): void {
  const urls: string[] = [];
  if (operator.deeplinkTemplate) {
    urls.push(operator.deeplinkTemplate.replace('{evseId}', encodeURIComponent(evseId ?? '')));
  }
  const term = encodeURIComponent(operator.name);
  if (Platform.OS === 'android') {
    if (operator.appAndroidPackage) urls.push(`market://details?id=${operator.appAndroidPackage}`);
    urls.push(
      `market://search?q=${term}&c=apps`,
      `https://play.google.com/store/search?q=${term}&c=apps`,
    );
  } else if (Platform.OS === 'ios') {
    if (operator.appIosUrl) urls.push(operator.appIosUrl);
    urls.push(
      `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${term}`,
    );
  }
  if (operator.website) urls.push(operator.website);
  void openFirst(urls);
}

export function openWebsite(url: string): void {
  void openFirst([url]);
}

export function callPhone(phone: string): void {
  void openFirst([`tel:${phone.replace(/\s+/g, '')}`]);
}
