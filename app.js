// Variáveis Globais
const clientId = 'ecc7df9a04c14418b8deba08f82a9909';
const redirectUri = 'http://127.0.0.1:5500/index.html';
const scope = 'playlist-modify-public playlist-modify-private user-read-email';
const CHAVE_ACCESS_TOKEN = 'pogfy_access_token';
const CHAVE_REFRESH_TOKEN = 'pogfy_refresh_token';
const CHAVE_CODE_VERIFIER = 'pogfy_code_verifier';


// Gera um texto aleatório que vai ser usado como "code verifier" no login do Spotify
function generateCodeVerifier(length) {

  // caracteres permitidos pelo Spotify para o code verifier: letras, números e -._~
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  // aqui vamos "grudando" um caractere por vez até formar o texto final
  let result = '';

  // cria um "array" vazio com espaço para 'length' números aleatórios (de 0 a 255 cada)
  const randomValues = new Uint8Array(length);

  // preenche esse array com números realmente aleatórios (mais seguro que Math.random)
  crypto.getRandomValues(randomValues);

    // percorre cada número aleatório gerado, um por um
  for (let i = 0; i < length; i++) {
    // usa o resto da divisão (%) pra transformar o número (0-255) numa posição válida da tabela (0-65)
    const indice = randomValues[i] % chars.length;

    // pega o caractere naquela posição da tabela e gruda no resultado final
    result += chars[indice];
  }

  return result;
}

// Calcula o "code challenge" a partir do code verifier, usando hash SHA-256
async function generateCodeChallenge(CodeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(CodeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashString = hashArray.map(byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(hashString);
    const base64UrlSafe = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    return base64UrlSafe;
}

// Inicia o processo de Login: gera os códigos PKCE e redireciona pro Spotify
async function redirectToSpotifyAuthorize() {
    const CodeVerifier = generateCodeVerifier(64);

    localStorage.setItem(CHAVE_CODE_VERIFIER, CodeVerifier);
    
    const codeChallenge = await generateCodeChallenge(CodeVerifier);

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Pega o botão de login pelo id, e chama a função de redirecionamento quando for clicado
document.getElementById('loginButton').addEventListener('click', redirectToSpotifyAuthorize);

handleRedirect();

// Verifica se a URL atual tem um código de autorização do Spotify
async function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // Se não tiver código na URL, não faz nada
    if (!code) {
        return;
    }

    const codeVerifier = localStorage.getItem(CHAVE_CODE_VERIFIER);

    // Monta os dados que o Spotify espera para trocar o código pelo token de acesso
    const bodyParams = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });

    // Faz a chama para o Spotify trocando o código pelo token de acesso
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams
    });

    const data = await response.json();

    if (!data.access_token) {
        console.error('Erro ao obter token:', data);
        return;
    }
    
    // Guardar o access_token e o refresh_token no localStorage
    localStorage.setItem(CHAVE_ACCESS_TOKEN, data.access_token);
    localStorage.setItem(CHAVE_REFRESH_TOKEN, data.refresh_token);

    atualizarTelaLogin();
    buscarPerfilUsuario();
}

// Verifica se o usuário está logado
function atualizarTelaLogin() {
    const token = localStorage.getItem(CHAVE_ACCESS_TOKEN);
    const telaLogin = document.getElementById('telaLogin');
    const appLogado = document.getElementById('appLogado');

    if (token) {
        telaLogin.classList.add('oculto');
        appLogado.classList.remove('oculto');
    } else {
        telaLogin.classList.remove('oculto');
        appLogado.classList.add('oculto');
    }
}

// Sincroniza foto e nome do perfil do Spotify para o Pogfy
async function buscarPerfilUsuario() {
    const token = localStorage.getItem(CHAVE_ACCESS_TOKEN);

    const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();

    document.getElementById('nomeUsuario').textContent = data.display_name;

    if (data.images && data.images.length > 0) {
        document.getElementById('fotoUsuario').src = data.images[0].url;
    }
}