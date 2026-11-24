<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { data, get } from '../servicos';

const route = useRoute();
const router = useRouter();
const t = ref<any>(null);
onMounted(async () => { t.value = await get(`/admissoes/${route.params.id}/lgpd`); });
const imprimir = () => window.print();
</script>

<template>
  <div style="background:#e9ecea;min-height:100vh;padding:24px">
    <div class="nao-imprimir inline" style="max-width:780px;margin:0 auto 12px;justify-content:space-between">
      <button @click="router.back()">← Voltar</button>
      <button class="primario" @click="imprimir">Imprimir / salvar PDF</button>
    </div>
    <article v-if="t" style="background:#fff;max-width:780px;margin:0 auto;padding:56px 64px;box-shadow:0 2px 10px rgba(0,0,0,.08);font-size:15px;line-height:1.7">
      <p class="mudo pequeno" style="margin:0 0 30px">{{ t.empresa }}</p>
      <h1 style="font-size:20px;margin-bottom:28px;text-align:center">{{ t.titulo }}</h1>
      <p v-for="(par, i) in t.texto.split('\n').filter((x: string) => x.trim())" :key="i" style="text-align:justify">{{ par }}</p>
      <div style="margin-top:56px">
        <p>Data: {{ data(t.data) }}</p>
        <p style="margin-top:56px">_____________________________________________</p>
        <p style="margin-top:-8px">{{ t.nome }}</p>
      </div>
    </article>
  </div>
</template>

<style>
@media print { body > #app > div { padding: 0 !important; background: #fff !important; } article { box-shadow: none !important; padding: 0 !important; } }
</style>
