const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

async function runTest2() {
  console.log('\n🔥 TEST 2: Doble Reserva (Citas Confluyentes) 🔥');
  
  const { data: authData } = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'demo@agendapro.com',
    password: 'demo123'
  });
  const headers = { Authorization: `Bearer ${authData.accessToken}` };

  console.log(`20 clientes distintos intentando reservar la misma hora exacta (2026-10-10 10:00)...`);
  
  const aptPromises = Array.from({ length: 20 }).map((_, i) => {
    const aptPayload = {
      clienteNombre: `Cliente Simultáneo ${i}`,
      servicio: 'Corte de Cabello',
      duracionMin: 60,
      precio: 0,
      fecha: '2026-10-10',
      hora: '10:00',
      estado: 'pendiente'
    };
    return axios.post(`${BASE_URL}/appointments`, aptPayload, { headers })
      .then(res => ({ success: true, msg: '✅' }))
      .catch(err => ({ success: false, msg: err.response?.data?.error || err.message }));
  });

  const aptResults = await Promise.all(aptPromises);
  const aptSuccess = aptResults.filter(r => r.success).length;
  const aptFailed = aptResults.filter(r => !r.success).length;

  console.log('Resultados del Test 2:');
  console.log(`✅ Citas agendadas exitosamente: ${aptSuccess} (Debería ser 1 para evitar doble reserva, a menos que el sistema permita reservas infinitas por defecto)`);
  console.log(`❌ Citas rechazadas (Horario ocupado): ${aptFailed}`);
  if (aptSuccess > 1) {
    console.log('⚠️ ALERTA: Hubo doble reserva. El bloqueo transaccional falló o no existe para los especialistas.');
  } else {
    console.log('🏆 ¡PRUEBA SUPERADA!');
  }
}

runTest2().catch(console.error);
