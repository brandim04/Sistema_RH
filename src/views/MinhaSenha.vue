<script setup lang="ts">
import { ref } from 'vue';
import { post, tentar } from '../servicos';

const atual = ref('');
const nova = ref('');
const conf = ref('');
async function salvar() {
  if (nova.value !== conf.value) return tentar(async () => { throw new Error('A confirmação não confere.'); });
  if (await tentar(() => post('/auth/senha', { atual: atual.value, nova: nova.value }), 'Senha alterada.')) { atual.value = nova.value = conf.value = ''; }
}
</script>

<template>
  <div>
    <div class="topo"><div><h1>Alterar senha</h1></div></div>
    <form class="cartao" style="max-width:420px" @submit.prevent="salvar">
      <div class="campo"><label>Senha atual</label><input v-model="atual" type="password" required autocomplete="current-password" /></div>
      <div class="campo"><label>Nova senha (mín. 8 caracteres, letras e números)</label><input v-model="nova" type="password" required minlength="8" autocomplete="new-password" /></div>
      <div class="campo"><label>Confirmar nova senha</label><input v-model="conf" type="password" required autocomplete="new-password" /></div>
      <button class="primario">Salvar</button>
    </form>
  </div>
</template>
