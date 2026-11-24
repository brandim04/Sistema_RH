<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cor, data, get, hojeISO, pode, post, rotulo, tentar } from '../servicos';

const router = useRouter();
const route = useRoute();
const lista = ref<any[]>([]);
const status = ref('ABERTO');
const novo = ref<any>(null);
const pessoas = ref<any[]>([]);
const modalidades = ref<any[]>([]);

async function carregar() { lista.value = await get(`/desligamentos?status=${status.value}`); }
watch(status, carregar);
onMounted(async () => {
  await carregar();
  if (route.query.novo) abrir(Number(route.query.novo));
});

async function abrir(colaboradorId?: number) {
  [pessoas.value, modalidades.value] = await Promise.all([get('/colaboradores'), get('/modalidades')]);
  pessoas.value = pessoas.value.filter((p) => p.status !== 'DESLIGADO');
  novo.value = { colaborador_id: colaboradorId ?? '', data_desligamento: hojeISO(), modalidade_id: '', observacoes: '' };
}
async function criar() {
  await tentar(async () => {
    const d = await post('/desligamentos', novo.value);
    router.push(`/desligamentos/${d.id}`);
  });
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Desligamentos</h1><p>Checklist por etapas, modalidade de rescisão, verbas, devolução de bens e conclusão.</p></div>
      <div class="acoes">
        <select v-model="status" style="width:auto"><option value="ABERTO">Em andamento</option><option value="CONCLUIDO">Concluídos</option><option value="CANCELADO">Cancelados</option><option value="">Todos</option></select>
        <button v-if="pode('processo:escrever')" class="primario" @click="abrir()">+ Novo desligamento</button>
      </div>
    </div>
    <div class="cartao">
      <table>
        <thead><tr><th>Pessoa</th><th>Data</th><th>Modalidade</th><th>Conclusão</th><th>Situação</th></tr></thead>
        <tbody>
          <tr v-for="d in lista" :key="d.id" class="clicavel" @click="router.push(`/desligamentos/${d.id}`)">
            <td><strong>{{ d.colaborador }}</strong><div class="mudo pequeno">{{ d.cargo }}</div></td>
            <td class="num">{{ data(d.data_desligamento) }}</td>
            <td>{{ d.modalidade ?? 'A definir' }}</td>
            <td style="min-width:140px"><div class="barra"><div :style="{ width: d.percentual + '%' }" /></div><span class="pequeno num">{{ d.percentual }}%</span></td>
            <td><span class="etiqueta" :class="cor('processo', d.status)">{{ rotulo('processo', d.status) }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!lista.length" class="vazio">Nenhum desligamento nesta situação.</div>
    </div>

    <div v-if="novo" class="modal-fundo" @click.self="novo = null">
      <form class="modal" @submit.prevent="criar">
        <h2>Novo desligamento</h2>
        <div class="campo"><label>Pessoa colaboradora *</label>
          <select v-model="novo.colaborador_id" required><option value="" disabled>Selecione…</option><option v-for="p in pessoas" :key="p.id" :value="p.id">{{ p.nome }} — {{ p.cargo }}</option></select>
        </div>
        <div class="form-grade">
          <div class="campo"><label>Data do desligamento *</label><input v-model="novo.data_desligamento" type="date" required /></div>
          <div class="campo"><label>Modalidade de rescisão</label><select v-model="novo.modalidade_id"><option value="">Definir depois</option><option v-for="m in modalidades" :key="m.id" :value="m.id">{{ m.nome }}</option></select></div>
        </div>
        <div class="campo"><label>Observações</label><textarea v-model="novo.observacoes" /></div>
        <footer><button type="button" @click="novo = null">Cancelar</button><button class="primario">Criar e gerar checklist</button></footer>
      </form>
    </div>
  </div>
</template>
