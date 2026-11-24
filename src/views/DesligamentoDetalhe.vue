<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Checklist from '../components/Checklist.vue';
import { exportarExcel } from '../excel';
import { confirmar, cor, data, get, hojeISO, moeda, patch, pedirTexto, pode, post, put, rotulo, ROTULOS, tentar } from '../servicos';

const route = useRoute();
const router = useRouter();
const d = ref<any>(null);
const modalidades = ref<any[]>([]);
const aba = ref<'checklist' | 'bens' | 'dados'>('checklist');
const aberto = computed(() => d.value?.status === 'ABERTO');
const podeEditar = computed(() => aberto.value && pode('processo:escrever'));
const modalidade = computed(() => modalidades.value.find((m) => m.id === d.value?.modalidade_id));

async function carregar() { d.value = await get(`/desligamentos/${route.params.id}`); }
onMounted(async () => { modalidades.value = await get('/modalidades'); carregar(); });

async function atualizar(campos: Record<string, unknown>, msg = 'Salvo.') {
  if (await tentar(() => put(`/desligamentos/${d.value.id}`, campos), msg)) carregar();
}
async function trocarModalidade(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const id = v ? Number(v) : null;
  if (d.value.modalidade_id && !(await confirmar('Trocar a modalidade de rescisão?', 'Os documentos da modalidade anterior serão substituídos e o motivo precisará ser reconfirmado (RN31/RN32).', 'Trocar'))) {
    (ev.target as HTMLSelectElement).value = d.value.modalidade_id ?? '';
    return;
  }
  atualizar({ modalidade_id: id }, 'Modalidade definida. Checklist atualizado.');
}

async function bem(e: any, status: string) {
  let observacao: string | null = null;
  if (status === 'EXTRAVIADO') {
    observacao = await pedirTexto('Equipamento extraviado', `Descreva a ocorrência com "${e.descricao}".`, 'Registrar');
    if (!observacao) return;
  }
  if (await tentar(() => patch(`/equipamentos/${e.id}`, { status, data_devolucao: status === 'ENTREGUE' ? null : hojeISO(), observacao }))) carregar();
}

const edicao = ref<any>(null);
async function salvarDados() {
  await atualizar(edicao.value, 'Dados salvos.');
  edicao.value = null;
}

async function concluir() {
  if (!(await confirmar('Concluir o desligamento?', `A pessoa passará para "Desligado" com data de demissão ${data(d.value.data_desligamento)}. Férias programadas após essa data serão canceladas.`, 'Concluir desligamento', true))) return;
  if (await tentar(() => post(`/desligamentos/${d.value.id}/concluir`), 'Desligamento concluído.')) carregar();
}
async function cancelar() {
  const motivo = await pedirTexto('Cancelar desligamento', 'Informe o motivo (ex.: reversão do pedido).', 'Cancelar desligamento');
  if (motivo && await tentar(() => post(`/desligamentos/${d.value.id}/cancelar`, { motivo }), 'Desligamento cancelado.')) carregar();
}
const imprimir = () => window.print();
function exportar() {
  exportarExcel(`checklist-desligamento-${d.value.colaborador}.xlsx`, 'Checklist de desligamento', [
    { titulo: 'Etapa', campo: 'categoria', largura: 24 }, { titulo: 'Descrição', campo: 'descricao', largura: 50 },
    { titulo: 'Feito/entregue', campo: 'status', formato: (v) => rotulo('item', v) }, { titulo: 'Prazo', campo: 'data_limite', formato: data },
    { titulo: 'Valor (R$)', campo: 'valor' }, { titulo: 'Observações', campo: 'observacao', largura: 40 },
  ], d.value.itens);
}
</script>

<template>
  <div v-if="d">
    <div class="topo">
      <div>
        <div class="mudo pequeno"><router-link to="/desligamentos">Desligamentos</router-link> / #{{ d.id }}</div>
        <h1>Desligamento — {{ d.colaborador }}</h1>
        <p>{{ d.cargo }} · {{ data(d.data_desligamento) }} · <span class="etiqueta" :class="cor('processo', d.status)">{{ rotulo('processo', d.status) }}</span></p>
      </div>
      <div class="acoes">
        <button @click="router.push('/fgts-digital')">Guia FGTS Digital</button>
        <button @click="exportar">Excel</button>
        <button @click="imprimir">PDF / imprimir</button>
        <template v-if="podeEditar">
          <button class="perigo" @click="cancelar">Cancelar</button>
          <button class="perigo cheio" :disabled="d.pendencias.length > 0" @click="concluir">Concluir desligamento</button>
        </template>
      </div>
    </div>

    <div class="grade g2">
      <section class="cartao">
        <h2>Modalidade e confirmações</h2>
        <div class="campo"><label>Modalidade de rescisão (RF42)</label>
          <select :value="d.modalidade_id ?? ''" :disabled="!podeEditar" @change="trocarModalidade"><option value="">Selecione…</option><option v-for="m in modalidades" :key="m.id" :value="m.id">{{ m.nome }}</option></select>
        </div>
        <div v-if="modalidade?.observacao" class="aviso azul">{{ modalidade.observacao }}</div>
        <div class="form-grade">
          <div class="campo"><label>Aviso prévio</label><select :value="d.aviso_previo" :disabled="!podeEditar" @change="atualizar({ aviso_previo: ($event.target as HTMLSelectElement).value })"><option v-for="(v, k) in ROTULOS.aviso" :key="k" :value="k">{{ v }}</option></select></div>
        </div>
        <label class="inline"><input type="checkbox" :checked="d.motivo_confirmado" :disabled="!podeEditar || !d.modalidade_id" @change="atualizar({ motivo_confirmado: ($event.target as HTMLInputElement).checked })" /> Motivo do desligamento confirmado com a empresa (RN32)</label>
        <label class="inline"><input type="checkbox" :checked="d.convencao_consultada" :disabled="!podeEditar" @change="atualizar({ convencao_consultada: ($event.target as HTMLInputElement).checked })" /> Convenção coletiva consultada (estabilidades) (RN35)</label>
        <label class="inline"><input type="checkbox" :checked="d.homologacao_sindicato" :disabled="!podeEditar" @change="atualizar({ homologacao_sindicato: ($event.target as HTMLInputElement).checked })" /> Rescisão será homologada no sindicato (RN34)</label>
      </section>

      <section class="cartao">
        <div class="inline" style="justify-content:space-between"><strong>Conclusão do checklist</strong><span class="num">{{ d.progresso.percentual }}%</span></div>
        <div class="barra" style="margin:6px 0 4px"><div :style="{ width: d.progresso.percentual + '%' }" /></div>
        <div class="mudo pequeno">{{ d.progresso.feitos }} feitos · {{ d.progresso.na }} não se aplicam · {{ d.progresso.pendentes }} pendentes</div>
        <div class="pequeno" style="margin-top:8px">Verbas conferidas (soma dos valores informados): <strong class="num">{{ moeda(d.total_verbas) }}</strong></div>
        <div v-if="aberto && d.pendencias.length" class="aviso ambar" style="margin:12px 0 0">
          <strong>{{ d.pendencias.length }} pendência(s) impedem a conclusão (RN37):</strong>
          <ul><li v-for="p in d.pendencias.slice(0, 7)" :key="p">{{ p }}</li><li v-if="d.pendencias.length > 7">… e mais {{ d.pendencias.length - 7 }}</li></ul>
        </div>
        <div v-else-if="aberto" class="aviso verde" style="margin:12px 0 0">Sem pendências obrigatórias. O desligamento pode ser concluído.</div>
        <div v-else-if="d.status === 'CONCLUIDO'" class="aviso verde" style="margin:12px 0 0">Concluído. A pessoa está com a situação "Desligado".</div>
      </section>
    </div>

    <div class="abas">
      <button :class="{ ativa: aba === 'checklist' }" @click="aba = 'checklist'">Checklist</button>
      <button :class="{ ativa: aba === 'bens' }" @click="aba = 'bens'">Devolução de bens ({{ d.equipamentos.filter((e: any) => e.status === 'ENTREGUE').length }} pendentes)</button>
      <button :class="{ ativa: aba === 'dados' }" @click="aba = 'dados'">Dados e orientações</button>
    </div>

    <section v-show="aba === 'checklist'" class="cartao">
      <div v-if="!d.modalidade_id" class="aviso azul">Selecione a modalidade de rescisão para incluir os documentos específicos dela no checklist.</div>
      <Checklist :itens="d.itens" :documentos="d.documentos" :colaborador-id="d.colaborador_id" :editavel="aberto" com-valor :url-novo-item="`/desligamentos/${d.id}/itens`" @mudou="carregar" />
    </section>

    <section v-if="aba === 'bens'" class="cartao">
      <p class="mudo" style="margin-top:0">Conferência com o inventário registrado na admissão (RF44, RN39).</p>
      <table>
        <thead><tr><th>Equipamento</th><th>Patrimônio</th><th>Entregue em</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in d.equipamentos" :key="e.id">
            <td>{{ e.descricao }}<div v-if="e.observacao" class="mudo pequeno">{{ e.observacao }}</div></td><td>{{ e.patrimonio ?? '—' }}</td><td>{{ data(e.data_entrega) }}</td>
            <td><span class="etiqueta" :class="cor('equipamento', e.status)">{{ rotulo('equipamento', e.status) }}</span><div v-if="e.data_devolucao" class="mudo pequeno">{{ data(e.data_devolucao) }}</div></td>
            <td style="text-align:right">
              <template v-if="aberto && pode('equipamento:escrever')">
                <button v-if="e.status !== 'DEVOLVIDO'" class="mini primario" @click="bem(e, 'DEVOLVIDO')">Devolvido</button>
                <button v-if="e.status === 'ENTREGUE'" class="mini perigo" @click="bem(e, 'EXTRAVIADO')">Extraviado</button>
                <button v-if="e.status !== 'ENTREGUE'" class="mini link" @click="bem(e, 'ENTREGUE')">Desfazer</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!d.equipamentos.length" class="vazio">Nenhum equipamento no inventário desta pessoa.</div>
    </section>

    <section v-if="aba === 'dados'" class="cartao">
      <template v-if="!edicao">
        <dl class="dados">
          <div><dt>Pessoa</dt><dd><router-link :to="`/colaboradores/${d.colaborador_id}`">{{ d.colaborador }}</router-link></dd></div>
          <div><dt>Admissão</dt><dd>{{ data(d.data_admissao) }}</dd></div>
          <div><dt>Data do desligamento</dt><dd>{{ data(d.data_desligamento) }}</dd></div>
          <div><dt>Observações</dt><dd style="white-space:pre-line">{{ d.observacoes ?? '—' }}</dd></div>
          <div style="grid-column:1/-1"><dt>Orientações pós-desligamento (benefícios, plano de saúde) — RN36</dt><dd style="white-space:pre-line">{{ d.orientacoes_pos ?? '—' }}</dd></div>
        </dl>
        <button v-if="podeEditar" style="margin-top:12px" @click="edicao = { data_desligamento: d.data_desligamento, observacoes: d.observacoes ?? '', orientacoes_pos: d.orientacoes_pos ?? '' }">Editar</button>
      </template>
      <form v-else @submit.prevent="salvarDados">
        <div class="campo" style="max-width:240px"><label>Data do desligamento</label><input v-model="edicao.data_desligamento" type="date" required /></div>
        <div class="campo"><label>Observações</label><textarea v-model="edicao.observacoes" /></div>
        <div class="campo"><label>Orientações pós-desligamento</label><textarea v-model="edicao.orientacoes_pos" placeholder="Ex.: manutenção do plano de saúde por até X meses, conforme a lei 9.656/98…" /></div>
        <p class="mudo pequeno">Alterar a data recalcula os prazos do checklist (exame demissional, pagamento etc.).</p>
        <div class="inline"><button class="primario">Salvar</button><button type="button" @click="edicao = null">Cancelar</button></div>
      </form>
    </section>
  </div>
</template>
