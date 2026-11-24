<script setup lang="ts">
import { onMounted, ref } from 'vue';
import GraficoBarras from '../components/GraficoBarras.vue';
import { get, moeda, pode, rotulo } from '../servicos';

const q = ref<any>(null);
onMounted(async () => { q.value = await get('/colaboradores/quadro'); });
</script>

<template>
  <div v-if="q">
    <div class="topo"><div><h1>Quadro de pessoal</h1><p>Equivale à aba "Painel de controle" da planilha de cadastro (RF10).</p></div></div>
    <div class="grade g4">
      <div class="cartao kpi"><div class="valor num">{{ q.totais.ativos }}</div><div class="rotulo">Pessoas no quadro</div></div>
      <div class="cartao kpi"><div class="valor num">{{ q.totais.admitidos_ano }}</div><div class="rotulo">Admitidas no ano</div></div>
      <div class="cartao kpi"><div class="valor num">{{ q.totais.desligados_ano }}</div><div class="rotulo">Desligadas no ano</div></div>
      <div class="cartao kpi"><div class="valor num" style="font-size:20px">{{ pode('colaborador:sensivel') ? moeda(q.totais.salario_medio) : '—' }}</div><div class="rotulo">Salário médio</div></div>
    </div>
    <div class="grade g2">
      <section class="cartao"><h2>Por área</h2><GraficoBarras :dados="q.porArea" /></section>
      <section class="cartao"><h2>Por nível</h2><GraficoBarras :dados="q.porNivel" :formatar="(r) => rotulo('nivel', r)" /></section>
      <section class="cartao"><h2>Por cargo</h2><GraficoBarras :dados="q.porCargo" /></section>
      <section v-if="pode('colaborador:sensivel')" class="cartao"><h2>Por faixa salarial</h2><GraficoBarras :dados="q.faixas" /></section>
      <section class="cartao"><h2>Por situação (todas as pessoas)</h2><GraficoBarras :dados="q.porStatus" :formatar="(r) => rotulo('status', r)" /></section>
    </div>
  </div>
</template>
