<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { get } from '../servicos';

const g = ref<any>(null);
const mods = ref<any[]>([]);
onMounted(async () => { [g.value, mods.value] = await Promise.all([get('/fgts-digital'), get('/modalidades')]); });
</script>

<template>
  <div v-if="g">
    <div class="topo"><div><h1>Guia FGTS Digital e documentos da rescisão</h1><p>Consulta de orientações (RF45). {{ g.fonte }}</p></div></div>
    <div class="aviso ambar">{{ g.aviso }}</div>
    <div class="grade g2">
      <section v-for="x in g.guias" :key="x.titulo" class="cartao">
        <h2>{{ x.titulo }}</h2>
        <p class="mudo pequeno" style="margin-top:-6px">{{ x.quando }}</p>
        <ol style="margin:0;padding-left:20px"><li v-for="p in x.passos" :key="p" style="margin-bottom:4px">{{ p }}</li></ol>
      </section>
    </div>
    <section class="cartao">
      <h2>Dicas</h2>
      <ul style="margin:0;padding-left:20px"><li v-for="d in g.dicas" :key="d" style="margin-bottom:4px">{{ d }}</li></ul>
    </section>
    <section class="cartao">
      <h2>Documentos por modalidade de rescisão</h2>
      <div class="grade g2">
        <div v-for="m in mods" :key="m.id">
          <h3>{{ m.nome }}</h3>
          <p v-if="m.observacao" class="mudo pequeno" style="margin:-4px 0 6px">{{ m.observacao }}</p>
          <ul style="margin:0 0 12px;padding-left:20px" class="pequeno"><li v-for="doc in m.documentos" :key="doc.descricao">{{ doc.descricao }}</li></ul>
        </div>
      </div>
    </section>
  </div>
</template>
