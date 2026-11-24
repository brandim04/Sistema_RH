<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cor, data, get, pode, post, rotulo, tentar } from '../servicos';

const router = useRouter();
const lista = ref<any[]>([]);
const status = ref('ABERTA');
const nova = ref<any>(null);
const candidatos = ref<any[]>([]);
const modelos = ref<any[]>([]);

async function carregar() { lista.value = await get(`/admissoes?status=${status.value}`); }
watch(status, carregar);
onMounted(carregar);

async function abrirNova() {
  [candidatos.value, modelos.value] = await Promise.all([get('/colaboradores'), get('/config/modelos-prazo')]);
  candidatos.value = candidatos.value.filter((c) => c.status !== 'DESLIGADO');
  nova.value = { colaborador_id: '', data_referencia: '', cargo: '', observacoes: '', modelo_prazo_id: modelos.value.find((m) => m.padrao)?.id ?? '' };
}
function escolher() {
  const c = candidatos.value.find((x) => x.id === Number(nova.value.colaborador_id));
  if (c) { nova.value.cargo = c.cargo; nova.value.data_referencia = c.data_admissao; }
}
async function criar() {
  await tentar(async () => {
    const a = await post('/admissoes', nova.value);
    router.push(`/admissoes/${a.id}`);
  });
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Admissões</h1><p>Checklist de admissão, documentos, exames, acessos, onboarding e prazos.</p></div>
      <div class="acoes">
        <select v-model="status" style="width:auto"><option value="ABERTA">Em andamento</option><option value="CONCLUIDA">Concluídas</option><option value="CANCELADA">Canceladas</option><option value="">Todas</option></select>
        <button v-if="pode('processo:escrever')" class="primario" @click="abrirNova">+ Nova admissão</button>
      </div>
    </div>
    <div class="cartao">
      <table>
        <thead><tr><th>Pessoa</th><th>Cargo</th><th>1º dia</th><th>Conclusão</th><th>Situação</th></tr></thead>
        <tbody>
          <tr v-for="a in lista" :key="a.id" class="clicavel" @click="router.push(`/admissoes/${a.id}`)">
            <td><strong>{{ a.colaborador }}</strong><div class="mudo pequeno">Matrícula {{ a.matricula }}</div></td>
            <td>{{ a.cargo }}</td>
            <td class="num">{{ data(a.data_referencia) }}</td>
            <td style="min-width:140px"><div class="barra"><div :style="{ width: a.percentual + '%' }" /></div><span class="pequeno num">{{ a.resolvidos }}/{{ a.total }} itens · {{ a.percentual }}%</span></td>
            <td><span class="etiqueta" :class="cor('processo', a.status)">{{ rotulo('processo', a.status) }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!lista.length" class="vazio">Nenhuma admissão nesta situação.</div>
    </div>

    <div v-if="nova" class="modal-fundo" @click.self="nova = null">
      <form class="modal" @submit.prevent="criar">
        <h2>Nova admissão</h2>
        <p class="mudo pequeno">A admissão deve estar ligada a uma pessoa já cadastrada (RN08). Se ainda não cadastrou, <router-link to="/colaboradores/novo">cadastre primeiro</router-link> com a situação "Em admissão".</p>
        <div class="campo"><label>Pessoa colaboradora *</label>
          <select v-model="nova.colaborador_id" required @change="escolher"><option value="" disabled>Selecione…</option><option v-for="c in candidatos" :key="c.id" :value="c.id">{{ c.nome }} — {{ rotulo('status', c.status) }}</option></select>
        </div>
        <div class="form-grade">
          <div class="campo"><label>Primeiro dia (data de referência) *</label><input v-model="nova.data_referencia" type="date" required /></div>
          <div class="campo"><label>Cargo</label><input v-model="nova.cargo" /></div>
        </div>
        <div class="campo"><label>Modelo de prazos</label><select v-model="nova.modelo_prazo_id"><option v-for="m in modelos" :key="m.id" :value="m.id">{{ m.nome }} ({{ m.etapas.length }} etapas)</option></select></div>
        <div class="campo"><label>Observações gerais</label><textarea v-model="nova.observacoes" /></div>
        <footer><button type="button" @click="nova = null">Cancelar</button><button class="primario">Criar e gerar checklist</button></footer>
      </form>
    </div>
  </div>
</template>
