<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { data, get, rotulo } from '../servicos';

const p = ref<any>(null);
const router = useRouter();
const filtroAlerta = ref('');
onMounted(async () => { p.value = await get('/painel'); });
const alertas = computed(() => (p.value?.alertas ?? []).filter((a: any) => !filtroAlerta.value || a.tipo === filtroAlerta.value));
const TIPOS: Record<string, string> = { TAREFA: 'Prazo de etapa', ADMISSAO: 'Admissão', DESLIGAMENTO: 'Desligamento', FERIAS: 'Férias' };
</script>

<template>
  <div v-if="p">
    <div class="topo">
      <div><h1>Painel de pendências</h1><p>Situação em {{ data(p.hoje) }} · alertas com até {{ p.alertaDias }} dias de antecedência</p></div>
    </div>

    <div class="grade g4">
      <div class="cartao kpi"><div class="valor num">{{ p.contadores.ativos }}</div><div class="rotulo">Colaboradores ativos</div></div>
      <div class="cartao kpi"><div class="valor num">{{ p.contadores.admissoes_abertas }}</div><div class="rotulo">Admissões em andamento</div></div>
      <div class="cartao kpi"><div class="valor num">{{ p.contadores.desligamentos_abertos }}</div><div class="rotulo">Desligamentos em andamento</div></div>
      <div class="cartao kpi" :class="{ alerta: p.contadores.ferias_vencidas > 0 }"><div class="valor num">{{ p.contadores.ferias_vencidas }}</div><div class="rotulo">Pessoas com férias vencidas</div></div>
    </div>

    <div class="grade g2">
      <section class="cartao">
        <div class="inline" style="justify-content:space-between;margin-bottom:8px">
          <h2 style="margin:0">Alertas de prazo</h2>
          <select v-model="filtroAlerta" style="width:auto">
            <option value="">Todos</option><option v-for="(v, k) in TIPOS" :key="k" :value="k">{{ v }}</option>
          </select>
        </div>
        <div v-if="!alertas.length" class="vazio">Nenhum alerta. 🎉</div>
        <table v-else>
          <tbody>
            <tr v-for="(a, i) in alertas.slice(0, 40)" :key="i" class="clicavel" @click="router.push(a.link)">
              <td style="width:88px" class="num">{{ data(a.data) }}</td>
              <td>
                <div>{{ a.mensagem }}</div>
                <div class="mudo pequeno">{{ TIPOS[a.tipo] }}<span v-if="a.responsavel"> · {{ a.responsavel }}</span></div>
              </td>
              <td style="text-align:right"><span class="etiqueta" :class="a.severidade === 'alta' ? 'vermelho' : 'ambar'">{{ a.tipo === 'FERIAS' ? rotulo('ferias', a.situacao) : rotulo('prazo', a.situacao) }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="cartao">
        <h2>Pendências por processo</h2>
        <div v-if="!p.processos.length" class="vazio">Nenhum processo em andamento.</div>
        <table v-else>
          <thead><tr><th>Pessoa</th><th>Processo</th><th>Conclusão</th><th title="Itens obrigatórios pendentes">Obrig.</th><th>Atrasos</th></tr></thead>
          <tbody>
            <tr v-for="x in p.processos" :key="x.tipo + x.id" class="clicavel" @click="router.push(`/${x.tipo === 'ADMISSAO' ? 'admissoes' : 'desligamentos'}/${x.id}`)">
              <td>{{ x.colaborador }}</td>
              <td><span class="etiqueta" :class="x.tipo === 'ADMISSAO' ? 'azul' : 'ambar'">{{ x.tipo === 'ADMISSAO' ? 'Admissão' : 'Desligamento' }}</span><div class="mudo pequeno">{{ data(x.data) }}</div></td>
              <td><div class="barra"><div :style="{ width: x.percentual + '%' }" /></div><span class="pequeno num">{{ x.percentual }}%</span></td>
              <td class="num">{{ x.obrigatorias_pendentes }}</td>
              <td><span v-if="x.atrasadas" class="etiqueta vermelho">{{ x.atrasadas }}</span><span v-else class="mudo">0</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
  <div v-else class="vazio">Carregando…</div>
</template>

