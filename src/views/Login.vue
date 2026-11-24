<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { post, sessao } from '../servicos';

const email = ref('');
const senha = ref('');
const erro = ref('');
const carregando = ref(false);
const router = useRouter();
const route = useRoute();

async function entrar() {
  erro.value = '';
  carregando.value = true;
  try {
    sessao.usuario = await post('/auth/login', { email: email.value, senha: senha.value });
    router.push(String(route.query.volta ?? '/'));
  } catch (e: any) {
    erro.value = e.message;
  } finally {
    carregando.value = false;
  }
}
</script>

<template>
  <div class="login">
    <form class="cartao" @submit.prevent="entrar">
      <div class="marca" style="color:var(--tinta);padding:0 0 18px">
        <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1f6f5c" /><circle cx="16" cy="16" r="8" fill="none" stroke="white" stroke-width="3" stroke-dasharray="38 12" /></svg>
        <div>Ciclo de Vida do Colaborador<small style="color:var(--tinta-3)">Cadastro · Admissão · Férias · Desligamento</small></div>
      </div>
      <div class="campo"><label for="email">E-mail</label><input id="email" v-model="email" type="email" autocomplete="username" required /></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" v-model="senha" type="password" autocomplete="current-password" required /></div>
      <div v-if="erro" class="aviso vermelho">{{ erro }}</div>
      <button class="primario" style="width:100%;justify-content:center" :disabled="carregando">{{ carregando ? 'Entrando…' : 'Entrar' }}</button>
      <p class="mudo pequeno" style="margin:14px 0 0">Acesso restrito a usuários autorizados. Os dados pessoais são tratados conforme a LGPD.</p>
    </form>
  </div>
</template>
