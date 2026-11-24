<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Checklist from '../components/Checklist.vue';
import { exportarExcel } from '../excel';
import { confirmar, cor, data, del, get, hojeISO, patch, pedirTexto, pode, post, put, rotulo, tentar } from '../servicos';

const route = useRoute();
const router = useRouter();
const a = ref<any>(null);
const aba = ref<'checklist' | 'prazos' | 'equipamentos' | 'dados'>('checklist');
const aberta = computed(() => a.value?.status === 'ABERTA');

async function carregar() { a.value = await get(`/admissoes/${route.params.id}`); }
onMounted(carregar);

// Dados gerais
const edicao = ref<any>(null);
function editar() { edicao.value = { data_referencia: a.value.data_referencia, cargo: a.value.cargo, observacoes: a.value.observacoes ?? '' }; }
async function salvarDados() {
  const mudouData = edicao.value.data_referencia !== a.value.data_referencia;
  if (await tentar(() => put(`/admissoes/${a.value.id}`, edicao.value), mudouData ? 'Dados salvos. Prazos recalculados (RN21).' : 'Dados salvos.')) { edicao.value = null; carregar(); }
}

// Tarefas
async function alternarTarefa(t: any) {
  if (await tentar(() => patch(`/tarefas/${t.id}`, { concluida: !t.concluida }))) carregar();
}
const novaTarefa = ref<any>(null);
async function criarTarefa() {
  if (await tentar(() => post(`/admissoes/${a.value.id}/tarefas`, novaTarefa.value), 'Etapa incluída.')) { novaTarefa.value = null; carregar(); }
}
async function removerTarefa(t: any) {
  if (await confirmar('Remover esta etapa?', t.etapa, 'Remover', true) && await tentar(() => del(`/tarefas/${t.id}`))) carregar();
}

// Equipamentos
const novoEq = ref<any>(null);
async function criarEq() {
  if (await tentar(() => post('/equipamentos', { ...novoEq.value, colaborador_id: a.value.colaborador_id, admissao_id: a.value.id }), 'Equipamento registrado.')) { novoEq.value = null; carregar(); }
}
async function removerEq(e: any) {
  if (await confirmar('Remover este equipamento do inventário?', e.descricao, 'Remover', true) && await tentar(() => del(`/equipamentos/${e.id}`))) carregar();
}
async function assinarTermo(v: boolean) {
  if (await tentar(() => put(`/admissoes/${a.value.id}`, { termo_equipamentos_assinado: v, termo_equipamentos_data: v ? hojeISO() : null }), v ? 'Assinatura do termo registrada.' : 'Assinatura removida.')) carregar();
}

async function concluir() {
  if (!(await confirmar('Concluir a admissão?', 'A pessoa passará para a situação "Ativo".', 'Concluir'))) return;
  if (await tentar(() => post(`/admissoes/${a.value.id}/concluir`), 'Admissão concluída.')) carregar();
}
async function cancelar() {
  const motivo = await pedirTexto('Cancelar admissão', 'Informe o motivo. O processo ficará no histórico.', 'Cancelar admissão');
  if (motivo && await tentar(() => post(`/admissoes/${a.value.id}/cancelar`, { motivo }), 'Admissão cancelada.')) carregar();
}

function exportarChecklist() {
  exportarExcel(`checklist-admissao-${a.value.colaborador}.xlsx`, 'Checklist de admissão', [
    { titulo: 'Etapa', campo: 'categoria', largura: 20 }, { titulo: 'Descrição', campo: 'descricao', largura: 44 },
    { titulo: 'Feito/entregue', campo: 'status', formato: (v) => rotulo('item', v) }, { titulo: 'Prazo', campo: 'data_limite', formato: data },
    { titulo: 'Observações', campo: 'observacao', largura: 40 }, { titulo: 'Orientação', campo: 'orientacao', largura: 60 },
  ], a.value.itens);
}
function exportarPrazos() {
  exportarExcel(`prazos-admissao-${a.value.colaborador}.xlsx`, 'Prazos', [
    { titulo: 'Etapa', campo: 'etapa', largura: 44 }, { titulo: 'Dias de antecedência', campo: 'dias' },
    { titulo: 'Data limite', campo: 'data_limite', formato: data }, { titulo: 'Dia da semana', campo: 'dia_semana' },
    { titulo: 'Responsável', campo: 'responsavel', largura: 24 }, { titulo: 'Responsável final', campo: 'responsavel_final', largura: 30 },
    { titulo: 'Situação', campo: 'situacao', formato: (v) => rotulo('prazo', v) },
  ], a.value.tarefas);
}
const imprimir = () => window.print();
</script>

<template>
  <div v-if="a">
    <div class="topo">
      <div>
        <div class="mudo pequeno"><router-link to="/admissoes">Admissões</router-link> / #{{ a.id }}</div>
        <h1>Admissão — {{ a.colaborador }}</h1>
        <p>{{ a.cargo }} · 1º dia {{ data(a.data_referencia) }} · <span class="etiqueta" :class="cor('processo', a.status)">{{ rotulo('processo', a.status) }}</span></p>
      </div>
      <div class="acoes">
        <button v-if="pode('colaborador:sensivel')" @click="router.push(`/admissoes/${a.id}/lgpd`)">Termo LGPD</button>
        <button @click="exportarChecklist">Excel</button>
        <button @click="imprimir">PDF / imprimir</button>
        <template v-if="aberta && pode('processo:escrever')">
          <button class="perigo" @click="cancelar">Cancelar</button>
          <button class="primario" :disabled="a.pendencias.length > 0" :title="a.pendencias.length ? 'Resolva as pendências obrigatórias' : ''" @click="concluir">Concluir admissão</button>
        </template>
      </div>
    </div>

    <div class="cartao">
      <div class="inline" style="justify-content:space-between">
        <div style="flex:1">
          <div class="inline" style="justify-content:space-between"><strong>Conclusão do checklist</strong><span class="num">{{ a.progresso.percentual }}%</span></div>
          <div class="barra" style="margin-top:6px"><div :style="{ width: a.progresso.percentual + '%' }" /></div>
          <div class="mudo pequeno" style="margin-top:4px">{{ a.progresso.feitos }} feitos · {{ a.progresso.na }} não se aplicam · {{ a.progresso.pendentes }} pendentes</div>
        </div>
      </div>
      <div v-if="aberta && a.pendencias.length" class="aviso ambar" style="margin:12px 0 0">
        <strong>{{ a.pendencias.length }} pendência(s) impedem a conclusão.</strong>
        <ul><li v-for="p in a.pendencias.slice(0, 6)" :key="p">{{ p }}</li><li v-if="a.pendencias.length > 6">… e mais {{ a.pendencias.length - 6 }}</li></ul>
      </div>
      <div v-else-if="aberta" class="aviso verde" style="margin:12px 0 0">Nenhuma pendência obrigatória. A admissão pode ser concluída.</div>
    </div>

    <div class="abas">
      <button :class="{ ativa: aba === 'checklist' }" @click="aba = 'checklist'">Checklist</button>
      <button :class="{ ativa: aba === 'prazos' }" @click="aba = 'prazos'">Prazos e etapas ({{ a.tarefas.filter((t: any) => t.situacao === 'ATRASADA').length }} atrasadas)</button>
      <button :class="{ ativa: aba === 'equipamentos' }" @click="aba = 'equipamentos'">Equipamentos ({{ a.equipamentos.length }})</button>
      <button :class="{ ativa: aba === 'dados' }" @click="aba = 'dados'">Dados do processo</button>
    </div>

    <section v-show="aba === 'checklist'" class="cartao">
      <Checklist :itens="a.itens" :documentos="a.documentos" :colaborador-id="a.colaborador_id" :editavel="aberta" :url-novo-item="`/admissoes/${a.id}/itens`" @mudou="carregar" />
    </section>

    <section v-if="aba === 'prazos'" class="cartao">
      <div class="inline" style="justify-content:space-between;margin-bottom:10px">
        <div class="mudo pequeno">Modelo: {{ a.modelo_prazo ?? '—' }} · Datas calculadas a partir do 1º dia ({{ data(a.data_referencia) }})</div>
        <div class="acoes"><button @click="exportarPrazos">Excel</button><button v-if="aberta && pode('processo:escrever')" @click="novaTarefa = { etapa: '', dias: 0, responsavel: '', responsavel_final: '' }">+ Etapa</button></div>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th></th><th>Etapa</th><th>Dias</th><th>Data limite</th><th>Dia</th><th>Responsável</th><th>Responsável final</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in a.tarefas" :key="t.id">
              <td><input type="checkbox" :checked="t.concluida" :disabled="!aberta || !pode('processo:escrever')" :aria-label="`Concluir ${t.etapa}`" @change="alternarTarefa(t)" /></td>
              <td :style="t.concluida ? 'text-decoration:line-through;color:var(--tinta-3)' : ''">{{ t.etapa }}</td>
              <td class="num">{{ t.dias > 0 ? '+' : '' }}{{ t.dias }}</td>
              <td class="num">{{ data(t.data_limite) }}</td>
              <td>{{ t.dia_semana }}</td>
              <td>{{ t.responsavel }}</td>
              <td class="mudo">{{ t.responsavel_final ?? '—' }}</td>
              <td><span class="etiqueta" :class="cor('prazo', t.situacao)">{{ rotulo('prazo', t.situacao) }}</span></td>
              <td><button v-if="aberta && pode('processo:escrever')" class="link mini perigo" @click="removerTarefa(t)">remover</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="aba === 'equipamentos'" class="cartao">
      <div class="inline" style="justify-content:space-between;margin-bottom:10px">
        <div>
          <strong>Termo de entrega de equipamentos:</strong>
          <span v-if="a.termo_equipamentos_assinado" class="etiqueta verde">Assinado em {{ data(a.termo_equipamentos_data) }}</span>
          <span v-else class="etiqueta ambar">Não assinado</span>
        </div>
        <div class="acoes" v-if="aberta && pode('equipamento:escrever')">
          <button v-if="pode('processo:escrever') && a.equipamentos.length" @click="assinarTermo(!a.termo_equipamentos_assinado)">{{ a.termo_equipamentos_assinado ? 'Desfazer assinatura' : 'Registrar assinatura' }}</button>
          <button class="primario" @click="novoEq = { descricao: '', patrimonio: '', data_entrega: a.data_referencia }">+ Equipamento</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Equipamento</th><th>Patrimônio / série</th><th>Entrega</th><th>Situação</th><th></th></tr></thead>
        <tbody><tr v-for="e in a.equipamentos" :key="e.id"><td>{{ e.descricao }}</td><td>{{ e.patrimonio ?? '—' }}</td><td>{{ data(e.data_entrega) }}</td><td><span class="etiqueta" :class="cor('equipamento', e.status)">{{ rotulo('equipamento', e.status) }}</span></td><td><button v-if="aberta && pode('equipamento:escrever')" class="link mini perigo" @click="removerEq(e)">remover</button></td></tr></tbody>
      </table>
      <div v-if="!a.equipamentos.length" class="vazio">Nenhum equipamento. O inventário será usado para conferir a devolução no desligamento (RN18/RN39).</div>
    </section>

    <section v-if="aba === 'dados'" class="cartao">
      <dl v-if="!edicao" class="dados">
        <div><dt>Pessoa</dt><dd><router-link :to="`/colaboradores/${a.colaborador_id}`">{{ a.colaborador }}</router-link></dd></div>
        <div><dt>Data de referência</dt><dd>{{ data(a.data_referencia) }}</dd></div>
        <div><dt>Cargo</dt><dd>{{ a.cargo }}</dd></div>
        <div><dt>Observações gerais</dt><dd style="white-space:pre-line">{{ a.observacoes ?? '—' }}</dd></div>
      </dl>
      <button v-if="!edicao && aberta && pode('processo:escrever')" style="margin-top:12px" @click="editar">Editar</button>
      <form v-if="edicao" @submit.prevent="salvarDados">
        <div class="form-grade">
          <div class="campo"><label>Data de referência (1º dia)</label><input v-model="edicao.data_referencia" type="date" required /></div>
          <div class="campo"><label>Cargo</label><input v-model="edicao.cargo" required /></div>
        </div>
        <div class="campo"><label>Observações gerais</label><textarea v-model="edicao.observacoes" /></div>
        <p class="mudo pequeno">Alterar a data de referência recalcula todos os prazos do processo (RN21).</p>
        <div class="inline"><button class="primario">Salvar</button><button type="button" @click="edicao = null">Cancelar</button></div>
      </form>
    </section>

    <div v-if="novaTarefa" class="modal-fundo" @click.self="novaTarefa = null">
      <form class="modal" @submit.prevent="criarTarefa">
        <h2>Nova etapa</h2>
        <div class="campo"><label>Etapa</label><input v-model="novaTarefa.etapa" required /></div>
        <div class="form-grade">
          <div class="campo"><label>Dias em relação ao 1º dia</label><input v-model.number="novaTarefa.dias" type="number" required /></div>
          <div class="campo"><label>Responsável</label><input v-model="novaTarefa.responsavel" required /></div>
          <div class="campo"><label>Responsável final</label><input v-model="novaTarefa.responsavel_final" /></div>
        </div>
        <footer><button type="button" @click="novaTarefa = null">Cancelar</button><button class="primario">Incluir</button></footer>
      </form>
    </div>
    <div v-if="novoEq" class="modal-fundo" @click.self="novoEq = null">
      <form class="modal" @submit.prevent="criarEq">
        <h2>Registrar equipamento entregue</h2>
        <div class="campo"><label>Equipamento</label><input v-model="novoEq.descricao" required placeholder="Ex.: Notebook Dell Latitude" /></div>
        <div class="form-grade">
          <div class="campo"><label>Patrimônio / nº de série</label><input v-model="novoEq.patrimonio" /></div>
          <div class="campo"><label>Data de entrega</label><input v-model="novoEq.data_entrega" type="date" required /></div>
        </div>
        <p class="mudo pequeno">Após registrar os itens, colete a assinatura do termo de entrega (RF20).</p>
        <footer><button type="button" @click="novoEq = null">Cancelar</button><button class="primario">Registrar</button></footer>
      </form>
    </div>
  </div>
</template>
