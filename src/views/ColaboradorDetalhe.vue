<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { confirmar, cor, data, dataHora, get, moeda, pode, post, rotulo, tentar } from '../servicos';

const route = useRoute();
const router = useRouter();
const c = ref<any>(null);
const aba = ref<'dados' | 'processos' | 'equipamentos' | 'documentos' | 'historico'>('dados');
const historico = ref<any[]>([]);
const equipamentos = ref<any[]>([]);
const documentos = ref<any[]>([]);

async function carregar() {
  c.value = await get(`/colaboradores/${route.params.id}`);
  if (pode('processo:ler')) {
    [equipamentos.value, documentos.value] = await Promise.all([
      get(`/colaboradores/${route.params.id}/equipamentos`), get(`/colaboradores/${route.params.id}/documentos`),
    ]);
  }
}
onMounted(carregar);
async function verHistorico() { aba.value = 'historico'; historico.value = await get(`/colaboradores/${route.params.id}/historico`); }

async function alterarStatus(status: 'ATIVO' | 'INATIVO') {
  const ok = await confirmar(status === 'INATIVO' ? 'Inativar esta pessoa?' : 'Reativar esta pessoa?',
    status === 'INATIVO' ? 'Pessoas inativas não recebem novos períodos de férias.' : '', status === 'INATIVO' ? 'Inativar' : 'Reativar', status === 'INATIVO');
  if (ok && await tentar(() => post(`/colaboradores/${c.value.id}/status`, { status }), 'Situação atualizada.')) carregar();
}
async function novaAdmissao() {
  await tentar(async () => {
    const a = await post('/admissoes', { colaborador_id: c.value.id, data_referencia: c.value.data_admissao });
    router.push(`/admissoes/${a.id}`);
  });
}
</script>

<template>
  <div v-if="c">
    <div class="topo">
      <div>
        <h1>{{ c.nome }}</h1>
        <p>Matrícula {{ c.matricula }} · {{ c.cargo }} · <span class="etiqueta" :class="cor('status', c.status)">{{ rotulo('status', c.status) }}</span></p>
      </div>
      <div class="acoes">
        <button @click="router.push(`/ferias/${c.id}`)" v-if="pode('ferias:ler')">Férias</button>
        <template v-if="pode('colaborador:escrever')">
          <button v-if="c.status === 'ATIVO'" @click="alterarStatus('INATIVO')">Inativar</button>
          <button v-if="c.status === 'INATIVO'" @click="alterarStatus('ATIVO')">Reativar</button>
          <button @click="router.push(`/colaboradores/${c.id}/editar`)" :disabled="c.status === 'DESLIGADO'">Editar</button>
        </template>
        <button v-if="pode('processo:escrever') && c.status !== 'DESLIGADO' && !c.admissoes.some((a: any) => a.status === 'ABERTA')" @click="novaAdmissao">Iniciar admissão</button>
        <button v-if="pode('processo:escrever') && c.status !== 'DESLIGADO' && !c.desligamentos.some((d: any) => d.status === 'ABERTO')" class="perigo" @click="router.push({ path: '/desligamentos', query: { novo: c.id } })">Iniciar desligamento</button>
      </div>
    </div>

    <div class="abas">
      <button :class="{ ativa: aba === 'dados' }" @click="aba = 'dados'">Consulta rápida</button>
      <button :class="{ ativa: aba === 'processos' }" @click="aba = 'processos'">Processos</button>
      <button v-if="pode('processo:ler')" :class="{ ativa: aba === 'equipamentos' }" @click="aba = 'equipamentos'">Equipamentos ({{ equipamentos.length }})</button>
      <button v-if="pode('processo:ler')" :class="{ ativa: aba === 'documentos' }" @click="aba = 'documentos'">Documentos ({{ documentos.length }})</button>
      <button :class="{ ativa: aba === 'historico' }" @click="verHistorico">Histórico</button>
    </div>

    <template v-if="aba === 'dados'">
      <section class="cartao">
        <h2>Dados pessoais</h2>
        <dl class="dados">
          <div><dt>CPF</dt><dd class="num">{{ c.cpf }}</dd></div>
          <div><dt>RG</dt><dd>{{ c.rg ?? '—' }}</dd></div>
          <div><dt>Nascimento</dt><dd>{{ data(c.data_nascimento) }}</dd></div>
          <div><dt>Nacionalidade</dt><dd>{{ c.nacionalidade ?? '—' }}</dd></div>
          <div><dt>Estado / cidade</dt><dd>{{ [c.estado, c.cidade].filter(Boolean).join(' · ') || '—' }}</dd></div>
          <div><dt>Estado civil</dt><dd>{{ rotulo('estado_civil', c.estado_civil) }}</dd></div>
          <div><dt>Título eleitoral</dt><dd>{{ c.titulo_eleitor ?? '—' }}</dd></div>
          <div><dt>Nº reservista</dt><dd>{{ c.reservista ?? '—' }}</dd></div>
        </dl>
      </section>
      <section class="cartao">
        <h2>Dados profissionais</h2>
        <dl class="dados">
          <div><dt>CTPS</dt><dd>{{ c.ctps ?? '—' }}</dd></div>
          <div><dt>PIS/PASEP</dt><dd>{{ c.pis_pasep ?? '—' }}</dd></div>
          <div><dt>Admissão</dt><dd>{{ data(c.data_admissao) }}</dd></div>
          <div><dt>Demissão</dt><dd>{{ data(c.data_demissao) }}</dd></div>
          <div><dt>Área</dt><dd>{{ c.area_nome ?? '—' }}</dd></div>
          <div><dt>Cargo</dt><dd>{{ c.cargo }}</dd></div>
          <div><dt>Nível</dt><dd>{{ rotulo('nivel', c.nivel) }}</dd></div>
          <div><dt>Salário</dt><dd>{{ pode('colaborador:sensivel') ? moeda(c.salario) : 'Restrito' }}</dd></div>
        </dl>
        <p v-if="!pode('colaborador:sensivel')" class="mudo pequeno">Alguns dados pessoais estão ocultos para o seu perfil (LGPD).</p>
      </section>
    </template>

    <section v-else-if="aba === 'processos'" class="cartao">
      <table>
        <thead><tr><th>Processo</th><th>Data</th><th>Detalhe</th><th>Situação</th></tr></thead>
        <tbody>
          <tr v-for="a in c.admissoes" :key="'a' + a.id" class="clicavel" @click="router.push(`/admissoes/${a.id}`)"><td>Admissão #{{ a.id }}</td><td>{{ data(a.data_referencia) }}</td><td>—</td><td><span class="etiqueta" :class="cor('processo', a.status)">{{ rotulo('processo', a.status) }}</span></td></tr>
          <tr v-for="d in c.desligamentos" :key="'d' + d.id" class="clicavel" @click="router.push(`/desligamentos/${d.id}`)"><td>Desligamento #{{ d.id }}</td><td>{{ data(d.data_desligamento) }}</td><td>{{ d.modalidade ?? '—' }}</td><td><span class="etiqueta" :class="cor('processo', d.status)">{{ rotulo('processo', d.status) }}</span></td></tr>
        </tbody>
      </table>
      <div v-if="!c.admissoes.length && !c.desligamentos.length" class="vazio">Nenhum processo registrado.</div>
    </section>

    <section v-else-if="aba === 'equipamentos'" class="cartao">
      <table>
        <thead><tr><th>Equipamento</th><th>Patrimônio</th><th>Entrega</th><th>Devolução</th><th>Situação</th></tr></thead>
        <tbody><tr v-for="e in equipamentos" :key="e.id"><td>{{ e.descricao }}</td><td>{{ e.patrimonio ?? '—' }}</td><td>{{ data(e.data_entrega) }}</td><td>{{ data(e.data_devolucao) }}</td><td><span class="etiqueta" :class="cor('equipamento', e.status)">{{ rotulo('equipamento', e.status) }}</span></td></tr></tbody>
      </table>
      <div v-if="!equipamentos.length" class="vazio">Nenhum equipamento registrado.</div>
    </section>

    <section v-else-if="aba === 'documentos'" class="cartao">
      <table>
        <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Enviado em</th></tr></thead>
        <tbody><tr v-for="d in documentos" :key="d.id"><td><a v-if="pode('colaborador:sensivel')" :href="`/api/documentos/${d.id}/download`" target="_blank" rel="noopener">{{ d.nome_arquivo }}</a><span v-else>{{ d.nome_arquivo }}</span></td><td>{{ Math.ceil(d.tamanho / 1024) }} KB</td><td>{{ dataHora(d.criado_em) }}</td></tr></tbody>
      </table>
      <div v-if="!documentos.length" class="vazio">Nenhum documento anexado. Anexe documentos pelos itens do checklist.</div>
    </section>

    <section v-else class="cartao">
      <table>
        <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Onde</th><th>Detalhes</th></tr></thead>
        <tbody><tr v-for="h in historico" :key="h.id"><td class="num" style="white-space:nowrap">{{ dataHora(h.criado_em) }}</td><td>{{ h.usuario_email ?? 'sistema' }}</td><td>{{ h.acao }}</td><td>{{ h.entidade }} #{{ h.entidade_id }}</td><td class="pequeno mudo"><code>{{ h.detalhes ? JSON.stringify(h.detalhes) : '' }}</code></td></tr></tbody>
      </table>
    </section>
  </div>
</template>
