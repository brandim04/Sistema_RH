<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { avisar, cor, data, dataHora, get, pedirTexto, pode, post, put, rotulo, tentar } from '../servicos';

const route = useRoute();
const d = ref<any>(null);
async function carregar() { d.value = await get(`/ferias/colaboradores/${route.params.id}`); }
onMounted(carregar);

// Formulário de registro/alteração com validação prévia (RF34)
const form = ref<any>(null);
const validacao = ref<{ erros: string[]; avisos: string[]; dias: number } | null>(null);
function programar(p: any) { form.value = { periodo: p, inicio: '', fim: '', id: null }; validacao.value = null; }
function alterar(p: any, f: any) { form.value = { periodo: p, inicio: f.inicio, fim: f.fim, id: f.id }; validacao.value = null; }
let t: any;
watch(() => form.value && [form.value.inicio, form.value.fim], () => {
  clearTimeout(t);
  if (!form.value?.inicio || !form.value?.fim) { validacao.value = null; return; }
  t = setTimeout(async () => {
    try {
      validacao.value = await post('/ferias/validar', {
        colaborador_id: d.value.colaborador.id, periodo_aquisitivo_id: form.value.periodo.id,
        inicio: form.value.inicio, fim: form.value.fim, ignorar_id: form.value.id ?? undefined,
      });
    } catch { validacao.value = null; }
  }, 250);
}, { deep: true });
function sugerirFim(dias: number) {
  if (!form.value.inicio) return;
  const x = new Date(form.value.inicio + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + dias - 1);
  form.value.fim = x.toISOString().slice(0, 10);
}
async function salvar() {
  const corpo = { colaborador_id: d.value.colaborador.id, periodo_aquisitivo_id: form.value.periodo.id, inicio: form.value.inicio, fim: form.value.fim };
  let r: any;
  const ok = await tentar(async () => { r = form.value.id ? await put(`/ferias/${form.value.id}`, corpo) : await post('/ferias', corpo); });
  if (ok) {
    avisar(form.value.id ? 'Férias alteradas.' : 'Férias registradas.', false, r.avisos?.length ? r.avisos : undefined);
    form.value = null;
    carregar();
  }
}
async function cancelar(f: any) {
  const motivo = await pedirTexto('Cancelar férias', `${data(f.inicio)} a ${data(f.fim)}. O registro ficará no histórico (RF39).`, 'Cancelar férias');
  if (motivo && await tentar(() => post(`/ferias/${f.id}/cancelar`, { motivo }), 'Férias canceladas.')) carregar();
}
async function editarFaltas(p: any) {
  const v = await pedirTexto('Faltas injustificadas no período', 'Afeta os dias de direito (CLT art. 130): até 5 faltas = 30 dias; 6–14 = 24; 15–23 = 18; 24–32 = 12; acima de 32 = sem direito.', 'Salvar');
  if (v === null) return;
  if (!/^\d+$/.test(v)) return avisar('Informe um número inteiro.', true);
  if (await tentar(() => put(`/ferias/periodos/${p.id}`, { faltas: Number(v) }), 'Faltas atualizadas.')) carregar();
}
const podeEscrever = computed(() => pode('ferias:escrever') && d.value?.colaborador.status === 'ATIVO');
</script>

<template>
  <div v-if="d">
    <div class="topo">
      <div>
        <div class="mudo pequeno"><router-link to="/ferias">Controle de férias</router-link> / {{ d.colaborador.matricula }}</div>
        <h1>Férias — {{ d.colaborador.nome }}</h1>
        <p>{{ d.colaborador.area ?? 'Sem área' }} · admissão em {{ data(d.colaborador.data_admissao) }} · <span class="etiqueta" :class="cor('status', d.colaborador.status)">{{ rotulo('status', d.colaborador.status) }}</span></p>
      </div>
    </div>
    <div v-if="d.colaborador.status !== 'ATIVO'" class="aviso ambar">Pessoas com situação "{{ rotulo('status', d.colaborador.status) }}" não podem receber novos períodos de férias (RN29).</div>

    <section v-for="p in d.periodos" :key="p.id" class="cartao">
      <div class="inline" style="justify-content:space-between;flex-wrap:wrap">
        <div>
          <h2 style="margin:0">{{ p.numero }}º período aquisitivo · {{ data(p.inicio) }} a {{ data(p.fim) }}</h2>
          <div class="mudo pequeno" style="margin-top:4px">
            Limite para início: <strong>{{ data(p.limite) }}</strong> · Direito: {{ p.direito }} dias<span v-if="p.faltas"> ({{ p.faltas }} faltas)</span> · Usados/programados: {{ p.usados }} · Saldo: <strong>{{ p.saldo }}</strong>
          </div>
        </div>
        <div class="acoes">
          <span class="etiqueta" :class="cor('ferias', p.situacao)">{{ p.rotulo }}</span>
          <button v-if="pode('ferias:escrever')" class="mini" @click="editarFaltas(p)">Faltas</button>
          <button v-if="podeEscrever && p.saldo > 0 && p.situacao !== 'EM_AQUISICAO'" class="primario mini" @click="programar(p)">Programar férias</button>
        </div>
      </div>
      <table v-if="p.ferias.length" style="margin-top:10px">
        <thead><tr><th>Início</th><th>Fim</th><th>Dias</th><th>Situação</th><th>Registro</th><th></th></tr></thead>
        <tbody>
          <tr v-for="f in p.ferias" :key="f.id" :style="f.status === 'CANCELADA' ? 'color:var(--tinta-3)' : ''">
            <td class="num">{{ data(f.inicio) }}</td><td class="num">{{ data(f.fim) }}</td><td class="num">{{ f.dias }}</td>
            <td><span class="etiqueta" :class="f.status === 'CANCELADA' ? '' : 'verde'">{{ f.status === 'CANCELADA' ? 'Cancelada' : 'Programada' }}</span><div v-if="f.motivo_cancelamento" class="pequeno">{{ f.motivo_cancelamento }}</div></td>
            <td class="pequeno mudo">{{ f.criado_por_nome ?? '—' }} · {{ dataHora(f.criado_em) }}</td>
            <td style="text-align:right"><template v-if="f.status === 'PROGRAMADA' && podeEscrever"><button class="link mini" @click="alterar(p, f)">Alterar</button><button class="link mini perigo" @click="cancelar(f)">Cancelar</button></template></td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="form" class="modal-fundo" @click.self="form = null">
      <form class="modal" @submit.prevent="salvar">
        <h2>{{ form.id ? 'Alterar férias' : 'Programar férias' }}</h2>
        <p class="mudo pequeno">{{ form.periodo.numero }}º período aquisitivo ({{ data(form.periodo.inicio) }} a {{ data(form.periodo.fim) }}) · saldo {{ form.periodo.saldo }} dias · limite para início {{ data(form.periodo.limite) }}</p>
        <div class="form-grade">
          <div class="campo"><label>Início</label><input v-model="form.inicio" type="date" required /></div>
          <div class="campo"><label>Fim</label><input v-model="form.fim" type="date" required /></div>
        </div>
        <div class="inline pequeno" style="margin-bottom:10px">Atalhos:
          <button v-for="n in [30, 20, 15, 14, 10, 5]" :key="n" type="button" class="mini" @click="sugerirFim(n)">{{ n }} dias</button>
        </div>
        <div v-if="validacao">
          <div v-if="validacao.erros.length" class="aviso vermelho"><strong>Não é possível registrar:</strong><ul><li v-for="e in validacao.erros" :key="e">{{ e }}</li></ul></div>
          <div v-else class="aviso verde">Período válido: {{ validacao.dias }} dias.</div>
          <div v-if="validacao.avisos.length" class="aviso ambar"><ul style="margin:0"><li v-for="e in validacao.avisos" :key="e">{{ e }}</li></ul></div>
        </div>
        <p class="mudo pequeno">Regras: até 3 períodos, um deles com 14 dias ou mais e nenhum com menos de 5 (CLT art. 134 §1º); sem conflito com outras férias; início fora dos 2 dias antes do repouso semanal (parâmetro).</p>
        <footer><button type="button" @click="form = null">Fechar</button><button class="primario" :disabled="!validacao || validacao.erros.length > 0">Salvar</button></footer>
      </form>
    </div>
  </div>
</template>
