<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { exportarExcel } from '../excel';
import { cor, data, get, rotulo } from '../servicos';

const router = useRouter();
const lista = ref<any[]>([]);
const areas = ref<any[]>([]);
const area = ref('');
const situacao = ref('');
const busca = ref('');
async function carregar() { lista.value = await get(`/ferias/colaboradores?area_id=${area.value}&situacao=${situacao.value}`); }
watch([area, situacao], carregar);
onMounted(async () => { areas.value = await get('/areas'); carregar(); });
const filtrada = computed(() => lista.value.filter((x) => !busca.value || x.nome.toLowerCase().includes(busca.value.toLowerCase())));

function exportar() {
  exportarExcel('controle-de-ferias.xlsx', 'Controle de férias', [
    { titulo: 'Colaborador(a)', campo: 'nome', largura: 28 }, { titulo: 'Matrícula', campo: 'matricula' }, { titulo: 'Área', campo: 'area' },
    { titulo: 'Início do período aquisitivo', campo: 'inicio_aquisitivo', formato: data }, { titulo: 'Fim do período aquisitivo', campo: 'fim_aquisitivo', formato: data },
    { titulo: 'Dias vencidos ou faltantes', campo: 'dias_desde_aquisicao' }, { titulo: 'Limite para início das férias', campo: 'limite_inicio', formato: data },
    { titulo: 'Início das férias', campo: 'proximas_ferias', formato: (v) => (v ? data(v.inicio) : 'A definir') },
    { titulo: 'Fim das férias', campo: 'proximas_ferias', formato: (v) => (v ? data(v.fim) : 'A definir') },
    { titulo: 'Saldo (dias)', campo: 'saldo' }, { titulo: 'Situação', campo: 'situacao', formato: (v) => rotulo('ferias', v) },
  ], filtrada.value);
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Controle de férias</h1><p>Período aquisitivo de referência, data limite e situação de cada pessoa.</p></div>
      <div class="acoes"><button @click="exportar">Exportar Excel</button><button @click="router.push('/ferias/mapa')">Mapa de férias</button></div>
    </div>
    <div class="cartao">
      <div class="filtros">
        <div class="campo" style="flex:1"><label>Nome</label><input v-model="busca" placeholder="Filtrar por nome" /></div>
        <div class="campo"><label>Área</label><select v-model="area"><option value="">Todas</option><option v-for="a in areas" :key="a.id" :value="a.id">{{ a.nome }}</option></select></div>
        <div class="campo"><label>Situação</label><select v-model="situacao"><option value="">Todas</option><option v-for="s in ['VENCIDAS', 'DISPONIVEIS', 'PARCIAL', 'PROGRAMADAS', 'EM_GOZO', 'EM_AQUISICAO']" :key="s" :value="s">{{ rotulo('ferias', s) }}</option></select></div>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th>Colaborador(a)</th><th>Área</th><th>Período aquisitivo</th><th title="Hoje menos o fim do período aquisitivo">Dias venc./falt.</th><th>Limite p/ início</th><th>Próximas férias</th><th>Saldo</th><th>Situação</th></tr></thead>
          <tbody>
            <tr v-for="x in filtrada" :key="x.colaborador_id" class="clicavel" @click="router.push(`/ferias/${x.colaborador_id}`)">
              <td><strong>{{ x.nome }}</strong><div class="mudo pequeno">{{ x.matricula }}<span v-if="x.status !== 'ATIVO'"> · {{ rotulo('status', x.status) }}</span></div></td>
              <td>{{ x.area ?? '—' }}</td>
              <td class="num"><template v-if="x.fim_aquisitivo">{{ x.periodo_numero }}º · {{ data(x.inicio_aquisitivo) }} a {{ data(x.fim_aquisitivo) }}</template><span v-else class="mudo">Inicia em {{ data(x.inicio_aquisitivo) }}</span></td>
              <td class="num">{{ x.dias_desde_aquisicao ?? '—' }}</td>
              <td class="num">{{ data(x.limite_inicio) }}<div v-if="['DISPONIVEIS','PARCIAL'].includes(x.situacao)" class="mudo pequeno">em {{ x.dias_para_limite }} dias</div></td>
              <td class="num">{{ x.proximas_ferias ? `${data(x.proximas_ferias.inicio)} a ${data(x.proximas_ferias.fim)}` : 'A definir' }}</td>
              <td class="num">{{ x.saldo }}</td>
              <td><span class="etiqueta" :class="cor('ferias', x.situacao)">{{ rotulo('ferias', x.situacao) }}</span><div v-if="x.periodos_vencidos > 1" class="pequeno" style="color:var(--vermelho)">{{ x.periodos_vencidos }} períodos vencidos</div></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filtrada.length" class="vazio">Nenhuma pessoa encontrada.</div>
      </div>
    </div>
  </div>
</template>
