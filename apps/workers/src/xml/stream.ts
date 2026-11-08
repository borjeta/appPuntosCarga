import { StringDecoder } from 'node:string_decoder';
import { SaxesParser } from 'saxes';

/**
 * Árbol mínimo de un elemento XML. Los nombres de elemento y atributo se guardan
 * SIN prefijo de namespace, porque cada publicador DATEX II usa prefijos distintos
 * (España: `egi:`, `fac:`; Portugal: `ns3:`, `ns4:`...).
 */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

export const localName = (qname: string): string => {
  const i = qname.indexOf(':');
  return i === -1 ? qname : qname.slice(i + 1);
};

/**
 * Recorre un XML enorme en streaming y emite, como árboles pequeños, cada elemento
 * cuyo nombre local esté en `elementNames` (sin anidar: el primero que se abre manda).
 * Memoria proporcional al tamaño de un elemento, no al del fichero.
 */
export async function* streamElements(
  input: AsyncIterable<string | Buffer>,
  elementNames: readonly string[],
): AsyncGenerator<XmlNode> {
  const wanted = new Set(elementNames);
  const parser = new SaxesParser({ xmlns: false });
  const stack: XmlNode[] = [];
  let ready: XmlNode[] = [];

  parser.on('opentag', (tag) => {
    const name = localName(tag.name);
    if (stack.length === 0 && !wanted.has(name)) return;
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(tag.attributes as Record<string, string>)) {
      attrs[localName(key)] = value;
    }
    const node: XmlNode = { name, attrs, text: '', children: [] };
    stack[stack.length - 1]?.children.push(node);
    stack.push(node);
  });

  parser.on('text', (text) => {
    const top = stack[stack.length - 1];
    if (top) top.text += text;
  });

  parser.on('closetag', () => {
    const node = stack.pop();
    if (!node) return;
    node.text = node.text.trim();
    if (stack.length === 0) ready.push(node);
  });

  // StringDecoder evita romper caracteres multibyte (á, ç, ã…) partidos entre dos chunks.
  const decoder = new StringDecoder('utf8');
  for await (const chunk of input) {
    parser.write(typeof chunk === 'string' ? chunk : decoder.write(chunk));
    if (ready.length) {
      const batch = ready;
      ready = [];
      yield* batch;
    }
  }
  parser.close();
  yield* ready;
}

/* ---------- Utilidades de consulta sobre XmlNode ---------- */

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** Primer descendiente (búsqueda en profundidad) con ese nombre. */
export function find(node: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}

/** Todos los descendientes con ese nombre (sin entrar dentro de los encontrados). */
export function findAll(node: XmlNode | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  if (!node) return out;
  for (const c of node.children) {
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}

/** Recorre una ruta de hijos directos: path(node, 'a', 'b', 'c'). */
export function path(node: XmlNode | undefined, ...names: string[]): XmlNode | undefined {
  let current = node;
  for (const n of names) current = child(current, n);
  return current;
}

export function text(node: XmlNode | undefined): string | null {
  const t = node?.text;
  return t ? t : null;
}

/** Texto de un MultilingualString DATEX II: <values><value lang="..">texto</value></values>. */
export function multilingual(node: XmlNode | undefined): string | null {
  const value = find(node, 'value');
  return text(value);
}

export function num(node: XmlNode | undefined): number | null {
  const t = text(node);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
