<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ dados: { rotulo: string; total: number }[]; formatar?: (r: string) => string }>();
const max = computed(() => Math.max(1, ...props.dados.map((d) => d.total)));
</script>

<template>
  <div class="grafico" role="img" :aria-label="dados.map((d) => `${formatar ? formatar(d.rotulo) : d.rotulo}: ${d.total}`).join(', ')">
    <div v-for="d in dados" :key="d.rotulo" class="linha-g">
      <span class="rot" :title="formatar ? formatar(d.rotulo) : d.rotulo">{{ formatar ? formatar(d.rotulo) : d.rotulo }}</span>
      <div class="bar"><div :style="{ width: (d.total / max) * 100 + '%' }" /></div>
      <span class="num">{{ d.total }}</span>
    </div>
    <div v-if="!dados.length" class="mudo pequeno">Sem dados.</div>
  </div>
</template>
