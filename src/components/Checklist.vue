<script setup lang="ts">
/**
 * Checklist compartilhado pela admissão e pelo desligamento (RF12-RF15, RF41, RF43).
 * Itens agrupados por etapa/categoria, com status, observação, orientação, prazo e anexos.
 */
import { computed, ref } from 'vue';
import { cor, data, del, moeda, patch, pode, post, rotulo, tentar } from '../servicos';

const props = defineProps<{
  itens: any[]; documentos: any[]; colaboradorId: number; editavel: boolean; comValor?: boolean;
  urlNovoItem: string;
}>();
const emit = defineEmits<{ (e: 'mudou'): void }>();

const filtro = ref<'todos' | 'pendentes'>('todos');
const grupos = computed(() => {
  const m = new Map<string, any[]>();
  for (const i of props.itens) {
    if (filtro.value === 'pendentes' && i.status !== 'NAO_FEITO') continue;
    if (!m.has(i.categoria)) m.set(i.categoria, []);
    m.get(i.categoria)!.push(i);
  }
  return [...m.entries()].map(([categoria, itens]) => ({
    categoria, itens, feitos: props.itens.filter((x) => x.categoria === categoria && x.status !== 'NAO_FEITO').length,
    total: props.itens.filter((x) => x.categoria === categoria).length,
  }));
});
const podeMarcar = computed(() => props.editavel && pode('checklist:marcar'));

async function marcar(i: any, status: string) {
  if (i.status === status) return;
  const anterior = i.status;
  i.status = status;
  const ok = await tentar(() => patch(`/itens/${i.id}`, { status }));
  if (!ok) i.status = anterior;
  else emit('mudou');
}
const editandoObs = ref<number | null>(null);
const obs = ref('');
const valor = ref<string>('');
function abrirObs(i: any) { editandoObs.value = i.id; obs.value = i.observacao ?? ''; valor.value = i.valor ?? ''; }
async function salvarObs(i: any) {
  const corpo: any = { observacao: obs.value };
  if (props.comValor && i.categoria === 'Financeiro e legal') corpo.valor = valor.value === '' ? null : Number(valor.value);
  if (await tentar(() => patch(`/itens/${i.id}`, corpo))) { editandoObs.value = null; emit('mudou'); }
}

const docsDoItem = (id: number) => props.documentos.filter((d) => d.checklist_item_id === id);
async function anexar(i: any, ev: Event) {
  const arq = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = '';
  if (!arq) return;
  if (arq.size > 2 * 1024 * 1024) return tentar(async () => { throw new Error('Arquivo acima de 2 MB.'); });
  const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(arq); });
  if (await tentar(() => post('/documentos', { colaborador_id: props.colaboradorId, checklist_item_id: i.id, nome_arquivo: arq.name, mime: arq.type, conteudo_base64: b64 }), 'Documento anexado.')) emit('mudou');
}
async function removerDoc(id: number) {
  if (await tentar(() => del(`/documentos/${id}`), 'Documento removido.')) emit('mudou');
}

const novo = ref<any>(null);
async function adicionar() {
  if (await tentar(() => post(props.urlNovoItem, novo.value), 'Item incluído.')) { novo.value = null; emit('mudou'); }
}
async function removerItem(i: any) {
  if (await tentar(() => del(`/itens/${i.id}`), 'Item removido.')) emit('mudou');
}
</script>

<template>
  <div>
    <div class="inline nao-imprimir" style="justify-content:space-between;margin-bottom:10px">
      <div class="seg">
        <button :class="{ on: filtro === 'todos', NAO_FEITO: true }" @click="filtro = 'todos'">Todos ({{ itens.length }})</button>
        <button :class="{ on: filtro === 'pendentes', NAO_FEITO: true }" @click="filtro = 'pendentes'">Pendentes ({{ itens.filter((i) => i.status === 'NAO_FEITO').length }})</button>
      </div>
      <button v-if="editavel && pode('processo:escrever')" @click="novo = { categoria: 'Outros', descricao: '', orientacao: '', obrigatorio: false, condicional: true, data_limite: '' }">+ Item avulso</button>
    </div>

    <div v-for="g in grupos" :key="g.categoria" class="cat">
      <div class="cat-titulo">
        <h3 style="margin:0">{{ g.categoria }}</h3>
        <span class="mudo pequeno">{{ g.feitos }}/{{ g.total }}</span>
      </div>
      <div v-for="i in g.itens" :key="i.id" class="item" :class="{ feito: i.status === 'FEITO', na: i.status === 'NA' }">
        <div>
          <div class="desc">
            {{ i.descricao }}
            <span v-if="i.obrigatorio && !i.condicional" class="etiqueta" title="Obrigatório">obrigatório</span>
            <span v-else-if="i.obrigatorio" class="etiqueta" title="Obrigatório quando aplicável">se aplicável</span>
            <span v-else class="etiqueta" title="Opcional">opcional</span>
            <span v-if="i.origem === 'MANUAL'" class="etiqueta azul">avulso</span>
          </div>
          <div v-if="i.orientacao" class="orient">{{ i.orientacao }}</div>
          <div v-if="i.data_limite" class="pequeno" style="margin-top:4px">
            Prazo: <strong>{{ data(i.data_limite) }}</strong> ({{ i.dia_semana }})
            <span v-if="i.situacao_prazo && i.situacao_prazo !== 'CONCLUIDA'" class="etiqueta" :class="cor('prazo', i.situacao_prazo)">{{ rotulo('prazo', i.situacao_prazo) }}</span>
          </div>
          <div v-if="i.observacao && editandoObs !== i.id" class="pequeno" style="margin-top:4px">📝 {{ i.observacao }}</div>
          <div v-if="comValor && i.valor !== null && i.valor !== undefined" class="pequeno num" style="margin-top:2px">Valor conferido: <strong>{{ moeda(i.valor) }}</strong></div>
          <div v-for="d in docsDoItem(i.id)" :key="d.id" class="pequeno" style="margin-top:3px">
            📎 <a v-if="pode('colaborador:sensivel')" :href="`/api/documentos/${d.id}/download`" target="_blank" rel="noopener">{{ d.nome_arquivo }}</a>
            <span v-else>{{ d.nome_arquivo }}</span>
            <button v-if="editavel && pode('processo:escrever')" class="link mini perigo" @click="removerDoc(d.id)">remover</button>
          </div>
          <div v-if="editandoObs === i.id" class="nao-imprimir" style="margin-top:6px">
            <textarea v-model="obs" placeholder="Observação" />
            <div v-if="comValor && i.categoria === 'Financeiro e legal'" class="campo" style="max-width:220px;margin-top:6px">
              <label>Valor conferido (R$)</label><input v-model="valor" type="number" step="0.01" min="0" />
            </div>
            <div class="inline" style="margin-top:6px"><button class="primario mini" @click="salvarObs(i)">Salvar</button><button class="mini" @click="editandoObs = null">Cancelar</button></div>
          </div>
        </div>
        <div class="nao-imprimir" style="text-align:right">
          <div class="seg" role="group" :aria-label="`Situação de ${i.descricao}`">
            <button v-for="s in ['FEITO', 'NAO_FEITO', 'NA']" :key="s" :class="[s, { on: i.status === s }]"
                    :disabled="!podeMarcar || (s === 'NA' && !i.condicional)" :title="s === 'NA' && !i.condicional ? 'Item não condicional' : ''"
                    @click="marcar(i, s)">{{ rotulo('item', s) }}</button>
          </div>
          <div v-if="podeMarcar" style="margin-top:6px" class="inline" >
            <button class="link mini" @click="abrirObs(i)">{{ comValor && i.categoria === 'Financeiro e legal' ? 'Obs./valor' : 'Observação' }}</button>
            <label v-if="pode('processo:escrever')" class="link mini" style="margin:0;cursor:pointer;color:var(--verde);font-size:12px">Anexar<input type="file" accept=".pdf,image/*" hidden @change="anexar(i, $event)" /></label>
            <button v-if="i.origem === 'MANUAL' && pode('processo:escrever')" class="link mini perigo" @click="removerItem(i)">Excluir</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!grupos.length" class="vazio">Nenhum item {{ filtro === 'pendentes' ? 'pendente' : '' }}.</div>

    <div v-if="novo" class="modal-fundo" @click.self="novo = null">
      <div class="modal">
        <h2>Item avulso no checklist</h2>
        <div class="campo"><label>Etapa/categoria</label><input v-model="novo.categoria" /></div>
        <div class="campo"><label>Descrição</label><input v-model="novo.descricao" /></div>
        <div class="campo"><label>Orientação</label><textarea v-model="novo.orientacao" /></div>
        <div class="campo"><label>Prazo (opcional)</label><input v-model="novo.data_limite" type="date" /></div>
        <label class="inline"><input v-model="novo.obrigatorio" type="checkbox" /> Obrigatório para concluir</label>
        <label class="inline"><input v-model="novo.condicional" type="checkbox" /> Permite "Não se aplica"</label>
        <footer><button @click="novo = null">Cancelar</button><button class="primario" :disabled="!novo.descricao" @click="adicionar">Incluir</button></footer>
      </div>
    </div>
  </div>
</template>
