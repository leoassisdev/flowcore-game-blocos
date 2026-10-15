// Blocos · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Jogo de blocos que caem: encaixe as peças, complete linhas e sobreviva à velocidade.
// Controles: ← → movem (segure para deslizar) · ↑ ou X gira horário · Z gira anti-horário
// · ↓ desce rápido · Espaço derruba (e começa) · C ou Shift guarda a peça · P pausa.
// No celular: botões na tela, ou deslize no tabuleiro (lado move, para baixo derruba,
// toque gira).
// Props:
//   tema?: "claro" | "escuro"   tema inicial (padrão "claro"); o botão sol/lua do HUD alterna
//   onTemaChange?: (tema) => void   avisa quando o jogador troca o tema
//   accent?: string             cor de destaque (padrão "#0057FF")
//   variacao?: "Clássico" | "Turbo" | "Caos"   preset inicial
//   modo?: "A" | "B"            A = maratona sem fim; B = 25 linhas partindo de lixo
//   alturaLixo?: number         linhas de lixo no Game B (padrão 6, de 0 a 12)
//   velocidadeQueda?: number    multiplicador da gravidade (padrão 1)
//   nivelInicial?: number       nível de partida (padrão 1)
//   fantasma?: boolean          mostra a sombra de onde a peça vai cair (padrão true)
//   obstaculosExtras?: number   a cada N peças travadas sobe uma linha de lixo (0 = nunca)
// O seletor "Variações" troca o preset ao vivo. Recorde salvo no localStorage.
// Requisitos: React 18+ e Tailwind CSS 3+. Zero dependências.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/* ----------------------------- lógica pura ----------------------------- */

export type TipoPeca = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const PECAS: Record<TipoPeca, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [2, 2],
    [2, 2],
  ],
  T: [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ],
  S: [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ],
  Z: [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ],
  J: [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ],
};

/** Gira a matriz 90°. 1 = horário, -1 = anti-horário. Não altera a original. */
export function rotacionar(m: number[][], sentido: 1 | -1): number[][] {
  const linhas = m.length;
  const colunas = linhas ? m[0].length : 0;
  const r: number[][] = [];
  for (let i = 0; i < colunas; i++) {
    const linha: number[] = [];
    for (let j = 0; j < linhas; j++) {
      linha.push(sentido === 1 ? m[linhas - 1 - j][i] : m[j][colunas - 1 - i]);
    }
    r.push(linha);
  }
  return r;
}

/** true se a peça (canto superior esquerdo em x,y) bate em bloco, parede ou chão. */
export function colide(tab: number[][], m: number[][], x: number, y: number): boolean {
  const linhas = tab.length;
  const colunas = linhas ? tab[0].length : 0;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= colunas || by >= linhas) return true;
      if (by < 0) continue;
      if (tab[by][bx]) return true;
    }
  }
  return false;
}

const CHUTES: [number, number][] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
];

/** Gira com chutes de parede; retorna a nova posição ou null se nada couber. */
export function tentarRotacao(
  tab: number[][],
  m: number[][],
  x: number,
  y: number,
  sentido: 1 | -1,
): { m: number[][]; x: number; y: number } | null {
  const g = rotacionar(m, sentido);
  for (const [dx, dy] of CHUTES) {
    if (!colide(tab, g, x + dx, y + dy)) return { m: g, x: x + dx, y: y + dy };
  }
  return null;
}

/** Remove linhas completas e insere linhas vazias no topo. Não altera a entrada. */
export function limparLinhas(tab: number[][]): { tabuleiro: number[][]; linhas: number } {
  const colunas = tab.length ? tab[0].length : 0;
  const restantes = tab.filter((l) => !l.every((v) => v !== 0)).map((l) => l.slice());
  const linhas = tab.length - restantes.length;
  const vazias = Array.from({ length: linhas }, () => new Array<number>(colunas).fill(0));
  return { tabuleiro: [...vazias, ...restantes], linhas };
}

/** Tabuleiro com `altura` linhas de lixo no fundo (cada uma com buraco e bloco). */
export function gerarLixo(altura: number, colunas = 10, linhas = 20, rnd: () => number = Math.random): number[][] {
  const h = Math.max(0, Math.min(linhas, Math.floor(altura)));
  const tab: number[][] = [];
  for (let r = 0; r < linhas; r++) {
    const linha = new Array<number>(colunas).fill(0);
    if (r >= linhas - h && colunas >= 2) {
      const buraco = Math.min(colunas - 1, Math.floor(rnd() * colunas));
      for (let c = 0; c < colunas; c++) {
        // Um buraco garantido e alguns furos aleatórios para variar o encaixe.
        linha[c] = c === buraco || rnd() < 0.12 ? 0 : 8;
      }
      if (!linha.some((v) => v !== 0)) linha[(buraco + 1) % colunas] = 8;
    }
    tab.push(linha);
  }
  return tab;
}

const TABELA_PONTOS = [0, 40, 100, 300, 1200];

/** Pontos por linhas limpas de uma vez, multiplicado pelo nível (começa em 1). */
export function pontuacaoLinhas(linhas: number, nivel: number): number {
  return (TABELA_PONTOS[linhas] ?? 0) * nivel;
}

/* ------------------------------ variações ------------------------------ */

type NomeVariacao = "Clássico" | "Turbo" | "Caos";
type Modo = "A" | "B";
type Config = { velocidadeQueda: number; nivelInicial: number; fantasma: boolean; obstaculosExtras: number };

const VARIACOES: Record<NomeVariacao, Config> = {
  Clássico: { velocidadeQueda: 1, nivelInicial: 1, fantasma: true, obstaculosExtras: 0 },
  Turbo: { velocidadeQueda: 1.8, nivelInicial: 3, fantasma: true, obstaculosExtras: 0 },
  Caos: { velocidadeQueda: 1.25, nivelInicial: 1, fantasma: true, obstaculosExtras: 8 },
};

/* --------------------------------- tema --------------------------------- */

export type Tema = "claro" | "escuro";
// Paleta do tema: vira CSS vars na raiz (classes) e é lida pelo canvas.
const TEMAS: Record<Tema, Record<string, string>> = {
  claro: {
    "--fc-bg": "#F7F8FB", "--fc-surface": "#FFFFFF", "--fc-surface-2": "#F1F4F9",
    "--fc-border": "#E3E8F0", "--fc-border-strong": "#CBD3E1",
    "--fc-text": "#0B1220", "--fc-muted": "#4B5565", "--fc-subtle": "#8A94A6",
    "--fc-pos": "#059669", "--fc-neg": "#E11D48", "--fc-warn": "#D97706",
    "--fc-shadow": "0 1px 2px rgba(16,24,40,.06), 0 12px 32px -16px rgba(16,24,40,.18)",
  },
  escuro: {
    "--fc-bg": "#0B0F17", "--fc-surface": "rgba(255,255,255,0.03)", "--fc-surface-2": "rgba(255,255,255,0.06)",
    "--fc-border": "rgba(255,255,255,0.10)", "--fc-border-strong": "rgba(255,255,255,0.25)",
    "--fc-text": "#FFFFFF", "--fc-muted": "rgba(255,255,255,0.60)", "--fc-subtle": "rgba(255,255,255,0.40)",
    "--fc-pos": "#34D399", "--fc-neg": "#FB7185", "--fc-warn": "#FBBF24",
    "--fc-shadow": "0 24px 48px -24px rgba(0,0,0,.6)",
  },
};

function BotaoTema({ tema, onClick }: { tema: Tema; onClick: () => void }) {
  const escuro = tema === "escuro";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      title={escuro ? "Modo claro" : "Modo escuro"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] transition-colors hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        {escuro ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

type Props = {
  tema?: Tema;
  onTemaChange?: (tema: Tema) => void;
  accent?: string;
  variacao?: NomeVariacao;
  modo?: Modo;
  alturaLixo?: number;
  velocidadeQueda?: number;
  nivelInicial?: number;
  fantasma?: boolean;
  obstaculosExtras?: number;
};

type Status = "inicio" | "jogando" | "pausado" | "fim" | "vitoria";

type Ativa = { tipo: TipoPeca; m: number[][]; x: number; y: number };

type Estado = {
  tab: number[][];
  peca: Ativa | null;
  fila: TipoPeca[];
  guardada: TipoPeca | null;
  podeGuardar: boolean;
  pontos: number;
  linhas: number;
  nivel: number;
  queda: number;
  trava: number;
  resets: number;
  maxY: number;
  limpando: { rows: number[]; t: number } | null;
  travadas: number;
  tempo: number;
  mov: { dir: -1 | 0 | 1; t: number; arr: number };
  esq: boolean;
  dir: boolean;
  suave: boolean;
  aviso: { texto: string; t: number } | null;
  impacto: number;
  acc: number;
};

const COLUNAS = 10;
const LINHAS = 20;
const META_B = 25;
const DAS = 0.16;
const ARR = 0.045;
const ATRASO_TRAVA = 0.5;
const MAX_RESETS = 15;
const FLASH = 0.32;
const PASSO = 1 / 120;
const TIPOS: TipoPeca[] = ["I", "O", "T", "S", "Z", "J", "L"];
// Paleta de desenho por tema (escuro = visual original). Índice das peças: 1..7 = I O T S Z J L, 8 = lixo.
type Paleta = {
  pecas: string[];
  fundo: string;
  xadrez: string | null;
  grade: string;
  perigo: string; // rgb do alerta de pilha alta
  flash: string | null; // rgb do flash de linha (null = usa o accent)
  luz: string;
  sombra: string;
  reflexo: string;
  pecaBlur: number;
  avisoTexto: string;
  avisoBlur: number;
  moldura: string; // fim do degradê da moldura
  molduraSombra: string;
};
const PALETA = {
  escuro: {
    pecas: ["#000", "#22D3EE", "#FACC15", "#A855F7", "#22C55E", "#EF4444", "#3B82F6", "#F97316", "#4B5563"],
    fundo: "#0E1420",
    xadrez: null,
    grade: "rgba(255,255,255,0.045)",
    perigo: "239,68,68",
    flash: "255,255,255",
    luz: "rgba(255,255,255,0.38)",
    sombra: "rgba(0,0,0,0.32)",
    reflexo: "rgba(255,255,255,0.22)",
    pecaBlur: 10,
    avisoTexto: "#fff",
    avisoBlur: 18,
    moldura: "rgba(255,255,255,0.06)",
    molduraSombra: "0 0 36px -10px",
  },
  claro: {
    pecas: ["#000", "#06B6D4", "#F59E0B", "#7C3AED", "#10B981", "#F43F5E", "#3B82F6", "#F97316", "#A3AEC2"],
    fundo: "#FFFFFF",
    xadrez: "#F5F7FB",
    grade: "rgba(15,23,42,0.06)",
    perigo: "225,29,72",
    flash: null,
    luz: "rgba(255,255,255,0.45)",
    sombra: "rgba(15,23,42,0.16)",
    reflexo: "rgba(255,255,255,0.35)",
    pecaBlur: 6,
    avisoTexto: "#0B1220",
    avisoBlur: 0,
    moldura: "#E3E8F0",
    molduraSombra: "0 14px 32px -16px",
  },
} satisfies Record<Tema, Paleta>;
const NOMES_LINHAS = ["", "Simples", "Dupla", "Tripla", "Quádrupla"];

const CHAVE = "flowcore-blocos-recorde";
const LINK = "https://flowcoresolucoes.com.br/codigos";

function lerRecorde(): number {
  try {
    return Number(localStorage.getItem(CHAVE)) || 0;
  } catch {
    return 0;
  }
}

function salvarRecorde(v: number) {
  try {
    localStorage.setItem(CHAVE, String(v));
  } catch {
    /* localStorage indisponível (modo privado, iframe sandbox) */
  }
}

function saco(): TipoPeca[] {
  const s = TIPOS.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function intervaloQueda(nivel: number, mult: number): number {
  const n = Math.min(Math.max(1, nivel), 20);
  const base = Math.pow(Math.max(0.05, 0.8 - (n - 1) * 0.007), n - 1);
  return Math.max(0.012, base / Math.max(0.1, mult));
}

function novoEstado(cfg: Config, modo: Modo, alturaLixo: number): Estado {
  return {
    tab: modo === "B" ? gerarLixo(alturaLixo, COLUNAS, LINHAS) : gerarLixo(0, COLUNAS, LINHAS),
    peca: null,
    fila: [...saco(), ...saco()],
    guardada: null,
    podeGuardar: true,
    pontos: 0,
    linhas: 0,
    nivel: Math.max(1, Math.floor(cfg.nivelInicial)),
    queda: 0,
    trava: 0,
    resets: 0,
    maxY: 0,
    limpando: null,
    travadas: 0,
    tempo: 0,
    mov: { dir: 0, t: 0, arr: 0 },
    esq: false,
    dir: false,
    suave: false,
    aviso: null,
    impacto: 0,
    acc: 0,
  };
}

function criarPeca(e: Estado, tipo: TipoPeca): boolean {
  const m = PECAS[tipo].map((l) => l.slice());
  const x = Math.floor((COLUNAS - m[0].length) / 2);
  let y = tipo === "I" ? -1 : 0;
  if (colide(e.tab, m, x, y)) y -= 1;
  if (colide(e.tab, m, x, y)) return false;
  e.peca = { tipo, m, x, y };
  e.queda = 0;
  e.trava = 0;
  e.resets = 0;
  e.maxY = y;
  return true;
}

function proximaDaFila(e: Estado): TipoPeca {
  const t = e.fila.shift() as TipoPeca;
  if (e.fila.length < 7) e.fila.push(...saco());
  return t;
}

/** Após mover/girar com sucesso: reinicia o atraso de trava (limitado). */
function reiniciarTrava(e: Estado) {
  if (e.trava > 0 && e.resets < MAX_RESETS) {
    e.trava = 0;
    e.resets++;
  }
}

function mover(e: Estado, dx: number): boolean {
  const p = e.peca;
  if (!p || e.limpando || colide(e.tab, p.m, p.x + dx, p.y)) return false;
  p.x += dx;
  reiniciarTrava(e);
  return true;
}

function girar(e: Estado, sentido: 1 | -1): boolean {
  const p = e.peca;
  if (!p || e.limpando || p.tipo === "O") return false;
  const r = tentarRotacao(e.tab, p.m, p.x, p.y, sentido);
  if (!r) return false;
  p.m = r.m;
  p.x = r.x;
  p.y = r.y;
  reiniciarTrava(e);
  return true;
}

function yFantasma(e: Estado): number {
  const p = e.peca;
  if (!p) return 0;
  let y = p.y;
  while (!colide(e.tab, p.m, p.x, y + 1)) y++;
  return y;
}

type Evento = "fim" | "vitoria" | null;

function aposTravar(e: Estado, cfg: Config, modo: Modo): Evento {
  if (modo === "B" && e.linhas >= META_B) return "vitoria";
  if (cfg.obstaculosExtras > 0 && e.travadas % Math.max(1, Math.floor(cfg.obstaculosExtras)) === 0) {
    if (e.tab[0].some((v) => v !== 0)) return "fim";
    e.tab.shift();
    e.tab.push(gerarLixo(1, COLUNAS, 1)[0]);
    e.impacto = 0.6;
  }
  return criarPeca(e, proximaDaFila(e)) ? null : "fim";
}

function travar(e: Estado, cfg: Config, modo: Modo): Evento {
  const p = e.peca;
  if (!p) return null;
  e.peca = null;
  e.podeGuardar = true;
  let acima = false;
  for (let r = 0; r < p.m.length; r++) {
    for (let c = 0; c < p.m[r].length; c++) {
      if (!p.m[r][c]) continue;
      const by = p.y + r;
      if (by < 0) {
        acima = true;
        continue;
      }
      e.tab[by][p.x + c] = p.m[r][c];
    }
  }
  if (acima) return "fim";
  e.travadas++;
  const cheias: number[] = [];
  e.tab.forEach((l, i) => {
    if (l.every((v) => v !== 0)) cheias.push(i);
  });
  if (cheias.length) {
    const nivelAntes = e.nivel;
    e.pontos += pontuacaoLinhas(Math.min(4, cheias.length), e.nivel);
    e.linhas += cheias.length;
    e.nivel = Math.max(1, Math.floor(cfg.nivelInicial)) + Math.floor(e.linhas / 10);
    e.limpando = { rows: cheias, t: FLASH };
    e.aviso = {
      texto: e.nivel > nivelAntes ? `Nível ${e.nivel}` : NOMES_LINHAS[Math.min(4, cheias.length)],
      t: 1.1,
    };
    if (cheias.length >= 4) e.impacto = 1;
    return null;
  }
  return aposTravar(e, cfg, modo);
}

function quedaLivre(e: Estado, cfg: Config, modo: Modo): Evento {
  const p = e.peca;
  if (!p || e.limpando) return null;
  const y = yFantasma(e);
  e.pontos += 2 * (y - p.y);
  p.y = y;
  e.impacto = Math.max(e.impacto, 0.45);
  return travar(e, cfg, modo);
}

function guardar(e: Estado): Evento {
  const p = e.peca;
  if (!p || !e.podeGuardar || e.limpando) return null;
  const tipo = e.guardada ?? proximaDaFila(e);
  e.guardada = p.tipo;
  e.podeGuardar = false;
  return criarPeca(e, tipo) ? null : "fim";
}

function passoJogo(e: Estado, dt: number, cfg: Config, modo: Modo): Evento {
  e.tempo += dt;
  if (e.limpando) {
    e.limpando.t -= dt;
    if (e.limpando.t <= 0) {
      e.tab = limparLinhas(e.tab).tabuleiro;
      e.limpando = null;
      return aposTravar(e, cfg, modo);
    }
    return null;
  }
  const p = e.peca;
  if (!p) return null;
  if (e.mov.dir !== 0) {
    e.mov.t += dt;
    if (e.mov.t >= DAS) {
      e.mov.arr += dt;
      while (e.mov.arr >= ARR) {
        e.mov.arr -= ARR;
        if (!mover(e, e.mov.dir)) {
          e.mov.arr = 0;
          break;
        }
      }
    }
  }
  const intervalo = intervaloQueda(e.nivel, cfg.velocidadeQueda);
  const iv = e.suave ? Math.min(intervalo, 0.035) : intervalo;
  if (!colide(e.tab, p.m, p.x, p.y + 1)) {
    e.trava = 0;
    e.queda += dt;
    while (e.queda >= iv) {
      e.queda -= iv;
      if (colide(e.tab, p.m, p.x, p.y + 1)) {
        e.queda = 0;
        break;
      }
      p.y++;
      if (e.suave) e.pontos += 1;
      if (p.y > e.maxY) {
        e.maxY = p.y;
        e.resets = 0;
      }
    }
  } else {
    e.queda = 0;
    e.trava += dt;
    if (e.trava >= ATRASO_TRAVA) return travar(e, cfg, modo);
  }
  return null;
}

function formatarTempo(s: number): string {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function aparar(m: number[][]): number[][] {
  const linhas = m.filter((l) => l.some((v) => v));
  const cols: number[] = [];
  for (let c = 0; c < (m[0]?.length ?? 0); c++) if (m.some((l) => l[c])) cols.push(c);
  return linhas.map((l) => cols.map((c) => l[c]));
}

function MiniPeca({
  tipo,
  apagada = false,
  tam = 13,
  tema = "escuro",
}: {
  tipo: TipoPeca | null;
  apagada?: boolean;
  tam?: number;
  tema?: Tema;
}) {
  const pal: Paleta = PALETA[tema];
  if (!tipo) return <div style={{ height: tam * 2, width: tam * 4 }} />;
  const m = aparar(PECAS[tipo]);
  return (
    <div
      className={`grid gap-[2px] transition-opacity ${apagada ? "opacity-30" : ""}`}
      style={{ gridTemplateColumns: `repeat(${m[0].length}, ${tam}px)` }}
    >
      {m.flatMap((l, r) =>
        l.map((v, c) => (
          <span
            key={`${r}-${c}`}
            className="block rounded-[3px]"
            style={{
              width: tam,
              height: tam,
              background: v ? pal.pecas[v] : "transparent",
              boxShadow: v
                ? tema === "escuro"
                  ? "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.3)"
                  : "inset 2px 2px 0 rgba(255,255,255,0.45), inset -2px -2px 0 rgba(15,23,42,0.16)"
                : "none",
            }}
          />
        )),
      )}
    </div>
  );
}

/* ------------------------------ componente ----------------------------- */

/* ------------------------------ como jogar ------------------------------ */

// Teclas mostradas na tela inicial e na pausa ("ou" vira separador).
const TECLAS: [string[], string][] = [
  [["←", "→"], "mover"],
  [["↑", "X", "ou", "Z"], "girar"],
  [["↓"], "descer rápido"],
  [["Espaço"], "derrubar"],
  [["C", "ou", "Shift"], "guardar a peça"],
  [["P"], "pausar"],
];
// Versão de toque, mostrada no celular (abaixo do jogo, onde sempre cabe).
const TOQUE = [
  "Botões abaixo do jogo: mover, girar, descer, guardar e derrubar",
  "No tabuleiro: deslize para os lados para mover, para baixo derruba e um toque gira",
];
const RESUMO_TECLADO = "← → movem · ↑ gira · ↓ desce · Espaço derruba · C guarda · P pausa";
const RESUMO_TOQUE = "Botões abaixo do jogo ou deslize no tabuleiro";

function ComoJogar({ className = "" }: { className?: string }) {
  return (
    <div className={`w-fit max-w-full text-xs text-[var(--fc-muted)] ${className}`}>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Como jogar</p>
      <div className="hidden grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 sm:grid">
        {TECLAS.map(([teclas, acao]) => (
          <div key={acao} className="contents">
            <span className="flex flex-wrap items-center justify-end gap-1">
              {teclas.map((t, i) =>
                t === "ou" ? (
                  <span key={i} className="text-[10px] text-[var(--fc-subtle)]">
                    ou
                  </span>
                ) : (
                  <kbd key={i} className="rounded-md border border-[var(--fc-border)] bg-[var(--fc-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fc-text)]">
                    {t}
                  </kbd>
                ),
              )}
            </span>
            <span className="text-left">{acao}</span>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-center sm:hidden">
        {TOQUE.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Blocos({
  accent = "#0057FF",
  tema = "claro",
  onTemaChange,
  variacao = "Clássico",
  modo = "A",
  alturaLixo = 6,
  velocidadeQueda,
  nivelInicial,
  fantasma,
  obstaculosExtras,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [temaAtual, setTemaAtual] = useState<Tema>(tema);
  useEffect(() => setTemaAtual(tema), [tema]);
  const temaRef = useRef<Tema>(tema);
  temaRef.current = temaAtual;
  const alternarTema = () => {
    const novo: Tema = temaAtual === "claro" ? "escuro" : "claro";
    setTemaAtual(novo);
    onTemaChange?.(novo);
    rootRef.current?.focus();
  };
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const inicial: Config = {
    ...VARIACOES[variacao],
    ...(velocidadeQueda !== undefined && { velocidadeQueda }),
    ...(nivelInicial !== undefined && { nivelInicial }),
    ...(fantasma !== undefined && { fantasma }),
    ...(obstaculosExtras !== undefined && { obstaculosExtras }),
  };
  const lixoInicial = Math.max(0, Math.min(12, Math.round(alturaLixo)));

  const [nomeVar, setNomeVar] = useState<NomeVariacao>(variacao);
  const [cfg, setCfg] = useState<Config>(inicial);
  const [modoAtual, setModoAtual] = useState<Modo>(modo);
  const [lixo, setLixo] = useState(lixoInicial);
  const [status, setStatus] = useState<Status>("inicio");
  const [hud, setHud] = useState({ pontos: 0, nivel: inicial.nivelInicial, linhas: 0, tempo: 0 });
  const [painel, setPainel] = useState<{ guardada: TipoPeca | null; fila: TipoPeca[]; podeGuardar: boolean }>({
    guardada: null,
    fila: [],
    podeGuardar: true,
  });
  const [recorde, setRecorde] = useState(0);
  const [largura, setLargura] = useState(640);

  const cfgRef = useRef(cfg);
  const modoRef = useRef<Modo>(modo);
  const lixoRef = useRef(lixoInicial);
  const statusRef = useRef<Status>("inicio");
  const estRef = useRef<Estado>(novoEstado(cfg, modo, lixoInicial));
  const accentRef = useRef(accent);
  const visivelRef = useRef(true);
  const hudRef = useRef("");
  const painelRef = useRef("");
  const toqueRef = useRef<{ x0: number; y0: number; ultimoX: number; moveu: boolean; t: number } | null>(null);

  cfgRef.current = cfg;
  accentRef.current = accent;

  useEffect(() => setRecorde(lerRecorde()), []);

  const mudarStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // Largura disponível -> tamanho da casa.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setLargura(w);
    });
    ro.observe(el);
    if (el.clientWidth) setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const lateral = largura >= 560 ? 250 : 0;
  const casa = Math.max(12, Math.floor(Math.min((largura - lateral) / COLUNAS, 26)));
  const cssW = casa * COLUNAS;
  const cssH = casa * LINHAS;

  // Pausa quando sai da tela.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      visivelRef.current = e.isIntersecting;
      if (!e.isIntersecting && statusRef.current === "jogando") mudarStatus("pausado");
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mudarStatus]);

  const sincronizar = useCallback(() => {
    const e = estRef.current;
    const chaveHud = `${e.pontos}|${e.nivel}|${e.linhas}|${Math.floor(e.tempo)}`;
    if (chaveHud !== hudRef.current) {
      hudRef.current = chaveHud;
      setHud({ pontos: e.pontos, nivel: e.nivel, linhas: e.linhas, tempo: Math.floor(e.tempo) });
    }
    const fila = e.fila.slice(0, 3);
    const chavePainel = `${e.guardada}|${fila.join("")}|${e.podeGuardar}`;
    if (chavePainel !== painelRef.current) {
      painelRef.current = chavePainel;
      setPainel({ guardada: e.guardada, fila, podeGuardar: e.podeGuardar });
    }
  }, []);

  useEffect(() => sincronizar(), [sincronizar]);

  const preparar = useCallback(
    (c: Config, m: Modo, l: number) => {
      estRef.current = novoEstado(c, m, l);
      sincronizar();
    },
    [sincronizar],
  );

  const iniciar = useCallback(() => {
    const e = novoEstado(cfgRef.current, modoRef.current, lixoRef.current);
    criarPeca(e, proximaDaFila(e));
    estRef.current = e;
    sincronizar();
    mudarStatus("jogando");
    rootRef.current?.focus();
  }, [mudarStatus, sincronizar]);

  const encerrar = useCallback(
    (s: "fim" | "vitoria") => {
      const e = estRef.current;
      e.mov = { dir: 0, t: 0, arr: 0 };
      e.esq = e.dir = e.suave = false;
      sincronizar();
      mudarStatus(s);
      const p = e.pontos;
      setRecorde((r) => {
        if (p > r) {
          salvarRecorde(p);
          return p;
        }
        return r;
      });
    },
    [mudarStatus, sincronizar],
  );

  const tratar = useCallback(
    (ev: Evento) => {
      if (ev) encerrar(ev);
    },
    [encerrar],
  );

  // Loop com passo fixo + desenho.
  useEffect(() => {
    let raf = 0;
    let ultimo = performance.now();
    const loop = (agora: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (agora - ultimo) / 1000));
      ultimo = agora;
      const e = estRef.current;
      if (statusRef.current === "jogando") {
        e.acc += dt;
        while (e.acc >= PASSO && statusRef.current === "jogando") {
          e.acc -= PASSO;
          const ev = passoJogo(e, PASSO, cfgRef.current, modoRef.current);
          if (ev) {
            tratar(ev);
            break;
          }
        }
        if (statusRef.current === "jogando") sincronizar();
      }
      if (e.aviso) {
        e.aviso.t -= dt;
        if (e.aviso.t <= 0) e.aviso = null;
      }
      e.impacto = Math.max(0, e.impacto - dt * 4);
      if (visivelRef.current) desenhar(agora / 1000);
    };
    const desenhar = (t: number) => {
      const cv = canvasRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth || cssW;
      const h = cv.clientHeight || cssH;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      // Coordenadas virtuais: 300 x 600 (casa de 30).
      const S = 30;
      const esc = w / (COLUNAS * S);
      const e = estRef.current;
      const ac = accentRef.current;
      const pal: Paleta = PALETA[temaRef.current];
      const CORES = pal.pecas;
      const tremor = e.impacto > 0 ? e.impacto * 4 * Math.sin(t * 70) : 0;
      ctx.setTransform(dpr * esc, 0, 0, dpr * esc, 0, tremor * dpr * esc);

      ctx.fillStyle = pal.fundo;
      ctx.fillRect(0, -10, COLUNAS * S, LINHAS * S + 20);
      if (pal.xadrez) {
        ctx.fillStyle = pal.xadrez;
        for (let r = 0; r < LINHAS; r++)
          for (let c = r % 2; c < COLUNAS; c += 2) ctx.fillRect(c * S, r * S, S, S);
      }
      // Grade
      ctx.strokeStyle = pal.grade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLUNAS; c++) {
        ctx.moveTo(c * S + 0.5, 0);
        ctx.lineTo(c * S + 0.5, LINHAS * S);
      }
      for (let r = 1; r < LINHAS; r++) {
        ctx.moveTo(0, r * S + 0.5);
        ctx.lineTo(COLUNAS * S, r * S + 0.5);
      }
      ctx.stroke();

      // Alerta de perigo quando a pilha sobe demais.
      let topo = LINHAS;
      for (let r = 0; r < LINHAS; r++)
        if (e.tab[r].some((v) => v)) {
          topo = r;
          break;
        }
      if (topo < 5) {
        ctx.fillStyle = `rgba(${pal.perigo},${0.08 + Math.sin(t * 6) * 0.04})`;
        ctx.fillRect(0, 0, COLUNAS * S, 4 * S);
      }

      // Blocos travados
      for (let r = 0; r < LINHAS; r++)
        for (let c = 0; c < COLUNAS; c++) {
          const v = e.tab[r][c];
          if (v) bloco(ctx, c * S, r * S, S, CORES[v], 1, pal);
        }

      // Linhas sendo limpas piscam
      if (e.limpando) {
        const k = e.limpando.t / FLASH;
        for (const r of e.limpando.rows) {
          const pisca = 0.25 + 0.6 * Math.abs(Math.sin(k * Math.PI * 2.5));
          if (pal.flash) {
            ctx.fillStyle = `rgba(${pal.flash},${pisca})`;
            ctx.fillRect(0, r * S, COLUNAS * S, S);
          } else {
            ctx.save();
            ctx.globalAlpha = pisca * 0.45;
            ctx.fillStyle = ac;
            ctx.fillRect(0, r * S, COLUNAS * S, S);
            ctx.restore();
          }
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = ac;
          ctx.fillRect(COLUNAS * S * (k / 2), r * S + S / 2 - 2, COLUNAS * S * (1 - k), 4);
          ctx.restore();
        }
      }

      const p = e.peca;
      if (p) {
        // Fantasma
        if (cfgRef.current.fantasma && statusRef.current !== "inicio") {
          const gy = yFantasma(e);
          if (gy !== p.y) {
            ctx.save();
            ctx.lineWidth = 2;
            for (let r = 0; r < p.m.length; r++)
              for (let c = 0; c < p.m[r].length; c++) {
                const v = p.m[r][c];
                if (!v || gy + r < 0) continue;
                ctx.globalAlpha = 0.16;
                ctx.fillStyle = CORES[v];
                ctx.fillRect((p.x + c) * S + 2, (gy + r) * S + 2, S - 4, S - 4);
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = CORES[v];
                ctx.strokeRect((p.x + c) * S + 3, (gy + r) * S + 3, S - 6, S - 6);
              }
            ctx.restore();
          }
        }
        // Peça ativa (escurece um pouco durante o atraso de trava)
        const brilho = 1 - Math.min(1, e.trava / ATRASO_TRAVA) * 0.35;
        ctx.save();
        ctx.shadowColor = CORES[PECAS[p.tipo].flat().find((v) => v) as number];
        ctx.shadowBlur = pal.pecaBlur;
        for (let r = 0; r < p.m.length; r++)
          for (let c = 0; c < p.m[r].length; c++) {
            const v = p.m[r][c];
            if (v && p.y + r >= 0) bloco(ctx, (p.x + c) * S, (p.y + r) * S, S, CORES[v], brilho, pal);
          }
        ctx.restore();
      }

      // Aviso (Dupla, Tripla, Nível...)
      if (e.aviso) {
        const a = Math.min(1, e.aviso.t * 2.5);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 30px ui-sans-serif, system-ui, sans-serif";
        ctx.shadowColor = ac;
        ctx.shadowBlur = pal.avisoBlur;
        ctx.fillStyle = pal.avisoTexto;
        ctx.fillText(e.aviso.texto, (COLUNAS * S) / 2, LINHAS * S * 0.35 - (1.1 - e.aviso.t) * 30);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cssW, cssH, tratar, sincronizar]);

  const reiniciarTela = (c: Config, m: Modo, l: number) => {
    preparar(c, m, l);
    mudarStatus("inicio");
    rootRef.current?.focus();
  };

  const trocarVariacao = (n: NomeVariacao) => {
    setNomeVar(n);
    const c = { ...VARIACOES[n], fantasma: cfgRef.current.fantasma };
    setCfg(c);
    cfgRef.current = c;
    reiniciarTela(c, modoRef.current, lixoRef.current);
  };

  const trocarModo = (m: Modo) => {
    setModoAtual(m);
    modoRef.current = m;
    reiniciarTela(cfgRef.current, m, lixoRef.current);
  };

  const trocarLixo = (d: number) => {
    const l = Math.max(0, Math.min(12, lixoRef.current + d));
    setLixo(l);
    lixoRef.current = l;
    reiniciarTela(cfgRef.current, modoRef.current, l);
  };

  const alternarFantasma = () => {
    const c = { ...cfgRef.current, fantasma: !cfgRef.current.fantasma };
    setCfg(c);
    cfgRef.current = c;
    rootRef.current?.focus();
  };

  const alternarPausa = () => {
    const s = statusRef.current;
    if (s === "jogando") mudarStatus("pausado");
    else if (s === "pausado") mudarStatus("jogando");
    else iniciar();
  };

  // Esquerda/direita com DAS/ARR.
  const pressionar = (d: -1 | 1) => {
    const e = estRef.current;
    if (d === -1) e.esq = true;
    else e.dir = true;
    mover(e, d);
    e.mov = { dir: d, t: 0, arr: 0 };
  };
  const soltar = (d: -1 | 1) => {
    const e = estRef.current;
    if (d === -1) e.esq = false;
    else e.dir = false;
    if (e.mov.dir === d) {
      const outra = d === -1 ? (e.dir ? 1 : 0) : e.esq ? -1 : 0;
      e.mov = { dir: outra, t: 0, arr: 0 };
    }
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const k = ev.key;
    if (k.startsWith("Arrow") || k === " ") ev.preventDefault();
    const s = statusRef.current;
    if (k === "p" || k === "P" || k === "Escape") {
      if (s === "jogando") mudarStatus("pausado");
      else if (s === "pausado") mudarStatus("jogando");
      return;
    }
    if (s !== "jogando") {
      if (k === " " || k === "Enter") {
        if (s === "pausado") mudarStatus("jogando");
        else iniciar();
      }
      return;
    }
    const e = estRef.current;
    switch (k) {
      case "ArrowLeft":
        if (!ev.repeat) pressionar(-1);
        break;
      case "ArrowRight":
        if (!ev.repeat) pressionar(1);
        break;
      case "ArrowDown":
        e.suave = true;
        break;
      case "ArrowUp":
      case "x":
      case "X":
        if (!ev.repeat) girar(e, 1);
        break;
      case "z":
      case "Z":
        if (!ev.repeat) girar(e, -1);
        break;
      case " ":
        if (!ev.repeat) tratar(quedaLivre(e, cfgRef.current, modoRef.current));
        break;
      case "c":
      case "C":
      case "Shift":
        tratar(guardar(e));
        break;
    }
  };

  const onKeyUp = (ev: KeyboardEvent<HTMLDivElement>) => {
    const k = ev.key;
    if (k === "ArrowLeft") soltar(-1);
    else if (k === "ArrowRight") soltar(1);
    else if (k === "ArrowDown") estRef.current.suave = false;
  };

  const onBlur = (ev: FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(ev.relatedTarget as Node)) return;
    const e = estRef.current;
    e.esq = e.dir = e.suave = false;
    e.mov = { dir: 0, t: 0, arr: 0 };
    if (statusRef.current === "jogando") mudarStatus("pausado");
  };

  // Gestos no tabuleiro: arrastar para o lado move, deslizar para baixo derruba, toque gira.
  const onToqueInicio = (ev: PointerEvent<HTMLCanvasElement>) => {
    if (statusRef.current !== "jogando") return;
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* captura indisponível */
    }
    toqueRef.current = { x0: ev.clientX, y0: ev.clientY, ultimoX: ev.clientX, moveu: false, t: performance.now() };
  };
  const onToqueMove = (ev: PointerEvent<HTMLCanvasElement>) => {
    const o = toqueRef.current;
    if (!o || statusRef.current !== "jogando") return;
    const passo = Math.max(14, casa * 0.9);
    let dx = ev.clientX - o.ultimoX;
    while (Math.abs(dx) >= passo) {
      const d = dx > 0 ? 1 : -1;
      mover(estRef.current, d);
      o.ultimoX += d * passo;
      o.moveu = true;
      dx = ev.clientX - o.ultimoX;
    }
  };
  const onToqueFim = (ev: PointerEvent<HTMLCanvasElement>) => {
    const o = toqueRef.current;
    toqueRef.current = null;
    if (!o || statusRef.current !== "jogando") return;
    const dx = ev.clientX - o.x0;
    const dy = ev.clientY - o.y0;
    const e = estRef.current;
    if (o.moveu) return;
    if (dy > 40 && dy > Math.abs(dx) * 1.3) tratar(quedaLivre(e, cfgRef.current, modoRef.current));
    else if (dy < -40 && -dy > Math.abs(dx)) tratar(guardar(e));
    else if (Math.hypot(dx, dy) < 14 && performance.now() - o.t < 350) girar(e, 1);
  };

  const comecarSeParado = () => {
    const s = statusRef.current;
    if (s === "jogando") return true;
    if (s !== "pausado") iniciar();
    return false;
  };

  const botao = (
    rotulo: string,
    icone: string,
    aoApertar: () => void,
    aoSoltar?: () => void,
    cls = "",
  ) => (
    <button
      type="button"
      aria-label={rotulo}
      onPointerDown={(ev) => {
        ev.preventDefault();
        if (comecarSeParado()) aoApertar();
      }}
      onPointerUp={(ev) => {
        ev.preventDefault();
        aoSoltar?.();
      }}
      onPointerLeave={() => aoSoltar?.()}
      onPointerCancel={() => aoSoltar?.()}
      className={`${cls} flex h-14 touch-none select-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface-2)] text-[var(--fc-text)] active:bg-[var(--fc-border)]`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d={icone} />
      </svg>
    </button>
  );

  const metaRestante = Math.max(0, META_B - hud.linhas);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      style={{ ...TEMAS[temaAtual], "--accent": accent } as CSSProperties}
      className="relative mx-auto w-full max-w-5xl select-none overflow-hidden rounded-3xl border border-[var(--fc-border)] bg-[var(--fc-bg)] p-3 shadow-[var(--fc-shadow)] text-[var(--fc-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:p-5"
    >
      {/* HUD */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
          <span className="text-sm font-semibold tracking-tight">Blocos</span>
          <BotaoTema tema={temaAtual} onClick={alternarTema} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--fc-muted)]">
          <span>
            Pontos <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.pontos}</b>
          </span>
          <span>
            Recorde <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{recorde}</b>
          </span>
          <span>
            Nível <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{hud.nivel}</b>
          </span>
          <span>
            {modoAtual === "B" ? "Faltam" : "Linhas"}{" "}
            <b className="ml-1 font-semibold tabular-nums text-[var(--fc-text)]">{modoAtual === "B" ? metaRestante : hud.linhas}</b>
          </span>
        </div>
      </div>

      {/* Variações */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-[var(--fc-subtle)]">Variações</span>
        {(Object.keys(VARIACOES) as NomeVariacao[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => trocarVariacao(n)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              nomeVar === n
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
            }`}
          >
            {n}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-[var(--fc-surface-2)] sm:block" />
        {(["A", "B"] as Modo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => trocarModo(m)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              modoAtual === m
                ? "border-[var(--accent)] text-[var(--fc-text)]"
                : "border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)] hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
            }`}
          >
            Game {m}
          </button>
        ))}
        {modoAtual === "B" && (
          <span className="flex items-center gap-1 rounded-full border border-[var(--fc-border)] bg-[var(--fc-surface)] px-1 py-0.5 text-xs text-[var(--fc-muted)]">
            <button
              type="button"
              aria-label="Menos lixo"
              onClick={() => trocarLixo(-2)}
              className="h-6 w-6 rounded-full hover:bg-[var(--fc-surface-2)] hover:text-[var(--fc-text)]"
            >
              −
            </button>
            <span className="tabular-nums">Lixo {lixo}</span>
            <button
              type="button"
              aria-label="Mais lixo"
              onClick={() => trocarLixo(2)}
              className="h-6 w-6 rounded-full hover:bg-[var(--fc-surface-2)] hover:text-[var(--fc-text)]"
            >
              +
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={alternarFantasma}
          className="ml-auto rounded-full border border-[var(--fc-border)] bg-[var(--fc-surface)] px-3 py-1 text-xs text-[var(--fc-muted)] transition-colors hover:border-[var(--fc-border-strong)] hover:text-[var(--fc-text)]"
        >
          {cfg.fantasma ? "Sombra ligada" : "Sombra desligada"}
        </button>
      </div>

      {/* Tabuleiro + painéis */}
      <div ref={areaRef} className="flex w-full flex-wrap items-start justify-center gap-3 sm:flex-nowrap">
        <div className="order-1 flex min-w-[88px] flex-col items-center gap-2 rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] p-2.5 sm:min-w-[104px] sm:p-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--fc-subtle)]">Guardada</span>
          <div className="flex h-9 items-center justify-center sm:h-12">
            <MiniPeca tema={temaAtual} tipo={painel.guardada} apagada={!painel.podeGuardar} tam={casa > 20 ? 14 : 11} />
          </div>
        </div>

        <div className="order-3 flex basis-full justify-center sm:order-2 sm:basis-auto">
          <div
            className="relative rounded-2xl p-[3px]"
            style={{
              background: `linear-gradient(180deg, ${accent}, ${PALETA[temaAtual].moldura})`,
              boxShadow: `${PALETA[temaAtual].molduraSombra} ${accent}`,
            }}
          >
            <div className="relative overflow-hidden rounded-[13px]" style={{ width: cssW, height: cssH }}>
              <canvas
                ref={canvasRef}
                onPointerDown={onToqueInicio}
                onPointerMove={onToqueMove}
                onPointerUp={onToqueFim}
                onPointerCancel={() => {
                  toqueRef.current = null;
                }}
                className="block h-full w-full touch-none"
                style={{ width: cssW, height: cssH }}
              />
              {status !== "jogando" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[color-mix(in_srgb,var(--fc-bg)_75%,transparent)] px-4 text-center backdrop-blur-[2px]">
                  {status === "fim" && (
                    <>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--fc-subtle)]">Fim de jogo</p>
                      <p className="text-4xl font-semibold tabular-nums">{hud.pontos}</p>
                      <p className="text-xs text-[var(--fc-muted)]">
                        Recorde <span className="tabular-nums text-[var(--fc-text)]">{recorde}</span>
                      </p>
                    </>
                  )}
                  {status === "vitoria" && (
                    <>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--fc-subtle)]">25 linhas</p>
                      <p className="text-2xl font-semibold">Você venceu!</p>
                      <p className="text-4xl font-semibold tabular-nums">{hud.pontos}</p>
                      <p className="text-xs text-[var(--fc-muted)]">
                        Tempo <span className="tabular-nums text-[var(--fc-text)]">{formatarTempo(hud.tempo)}</span> · Recorde{" "}
                        <span className="tabular-nums text-[var(--fc-text)]">{recorde}</span>
                      </p>
                    </>
                  )}
                  {status === "pausado" && <p className="text-lg font-semibold">Pausado</p>}
                  {status === "inicio" && (
                    <>
                      <p className="text-lg font-semibold">Blocos</p>
                      <p className="max-w-[220px] text-xs text-[var(--fc-muted)]">
                        {modoAtual === "A"
                          ? "Maratona: a velocidade sobe a cada 10 linhas."
                          : `Limpe ${META_B} linhas partindo de ${lixo} linhas de lixo.`}
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => (status === "pausado" ? (mudarStatus("jogando"), rootRef.current?.focus()) : iniciar())}
                    className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_var(--accent)] transition hover:brightness-110"
                  >
                    {status === "fim" || status === "vitoria"
                      ? "Jogar de novo"
                      : status === "pausado"
                        ? "Continuar"
                        : "Clique para jogar"}
                  </button>
                  {status === "inicio" || status === "pausado" ? (
                    <ComoJogar className="hidden sm:block" />
                  ) : (
                    <p className="hidden text-[11px] text-[var(--fc-subtle)] sm:block">Clique ou aperte Espaço · P pausa</p>
                  )}
                  <p className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</p>
                  <a href={LINK} target="_blank" rel="noopener" className="text-[10px] text-[var(--fc-subtle)] hover:text-[var(--fc-muted)]">
                    Criado por FlowCore Soluções LTDA
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="order-2 flex flex-col items-center gap-2 rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] p-2.5 sm:order-3 sm:min-w-[104px] sm:p-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--fc-subtle)]">Próximas</span>
          <div className="flex items-center gap-3 sm:flex-col sm:gap-4">
            {painel.fila.map((tp, i) => (
              <div key={i} className={`flex h-9 items-center justify-center sm:h-12 ${i > 0 ? "opacity-60" : ""}`}>
                <MiniPeca tema={temaAtual} tipo={tp} tam={casa > 20 ? (i === 0 ? 14 : 11) : i === 0 ? 11 : 8} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controles de toque */}
      <div className="mt-4 grid grid-cols-4 gap-2 sm:hidden">
        {botao("Esquerda", "M6 12l9-7v14z", () => pressionar(-1), () => soltar(-1))}
        {botao("Direita", "M18 12L9 19V5z", () => pressionar(1), () => soltar(1))}
        {botao(
          "Girar",
          "M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z",
          () => girar(estRef.current, 1),
        )}
        {botao(
          "Descer",
          "M12 18L5 9h14z",
          () => {
            estRef.current.suave = true;
          },
          () => {
            estRef.current.suave = false;
          },
        )}
        {botao("Guardar", "M5 4h14v4H5zM6 10h12v10H6zm4 3v2h4v-2z", () =>
          tratar(guardar(estRef.current)),
        )}
        {botao(
          "Derrubar",
          "M11 3h2v9l3-3 1.4 1.4L12 15.8 6.6 10.4 8 9l3 3zM5 18h14v3H5z",
          () => tratar(quedaLivre(estRef.current, cfgRef.current, modoRef.current)),
          undefined,
          "col-span-2",
        )}
        <button
          type="button"
          aria-label="Pausar"
          onPointerDown={(ev) => {
            ev.preventDefault();
            alternarPausa();
          }}
          className="flex h-14 touch-none items-center justify-center rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] text-[var(--fc-muted)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d={status === "jogando" ? "M7 5h3v14H7zM14 5h3v14h-3z" : "M8 5l11 7-11 7z"} />
          </svg>
        </button>
      </div>

      {/* Como jogar no celular: fica fora do canvas, que é pequeno na tela estreita */}
      {status !== "jogando" && <ComoJogar className="mx-auto mt-4 rounded-2xl border border-[var(--fc-border)] bg-[var(--fc-surface)] px-4 py-3 sm:hidden" />}

      {/* Rodapé com assinatura */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[var(--fc-border)] pt-3 text-center sm:justify-between sm:text-left">
        <span className="hidden text-[11px] text-[var(--fc-muted)] sm:inline">{RESUMO_TECLADO}</span>
        <span className="text-[11px] text-[var(--fc-muted)] sm:hidden">{RESUMO_TOQUE}</span>
        <a href={LINK} target="_blank" rel="noopener" className="text-[11px] text-[var(--fc-subtle)] transition-colors hover:text-[var(--fc-muted)]">
          Criado por FlowCore Soluções LTDA
        </a>
      </div>
    </div>
  );
}

/** Bloco com relevo: base, luz no topo/esquerda, sombra embaixo/direita e brilho interno. */
function bloco(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, cor: string, brilho: number, pal: Paleta) {
  const b = 3;
  ctx.globalAlpha = brilho;
  ctx.fillStyle = cor;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = pal.luz;
  ctx.fillRect(x + 1, y + 1, s - 2, b);
  ctx.fillRect(x + 1, y + 1, b, s - 2);
  ctx.fillStyle = pal.sombra;
  ctx.fillRect(x + 1, y + s - 1 - b, s - 2, b);
  ctx.fillRect(x + s - 1 - b, y + 1, b, s - 2);
  ctx.fillStyle = pal.reflexo;
  ctx.fillRect(x + b + 3, y + b + 3, s * 0.22, s * 0.22);
  ctx.globalAlpha = 1;
}
