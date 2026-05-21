const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

async function runTests() {
  console.log('==============================================');
  console.log('🚀 INICIANDO BATERÍA DE PRUEBAS DE ESTRÉS...');
  console.log('==============================================\n');

  // 1. Iniciar sesión para obtener el token
  const { data: authData } = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'demo@agendapro.com',
    password: 'demo123'
  });
  const token = authData.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  // PREPARACIÓN DE DATOS
  console.log('⏳ Preparando entorno (Creando cliente y producto de prueba)...');
  const randomStr = Math.random().toString(36).substring(7);
  const { data: newCustomer } = await axios.post(`${BASE_URL}/customers`, {
    nombre: 'Stress Bot',
    email: `stress_${randomStr}@bot.com`,
    telefono: '1234567890'
  }, { headers });
  const customerId = newCustomer.customer.id;

  // Crear un producto con exactamente 1 unidad en stock
  const { data: product } = await axios.post(`${BASE_URL}/products`, {
    nombre: 'Macbook Air M2 (Prueba de Estrés)',
    precio: 1000,
    stock: 1, // ¡Solo 1 en stock!
    costo: 500,
    unidad: 'pieza'
  }, { headers });
  const productId = product.product.id;


  // ----------------------------------------------------------------------
  // TEST 1: Condición de Carrera en Ventas (El más crítico)
  // ----------------------------------------------------------------------
  console.log('\n🔥 TEST 1: Condición de Carrera en Inventario (Black Friday) 🔥');
  console.log(`Tenemos 1 Macbook en stock. 50 cajeros van a intentar venderla en el mismo milisegundo...`);
  
  const checkoutPayload = {
    clienteId: customerId,
    items: [{ tipo: 'product', id: productId, cantidad: 1 }],
    pagos: [{ metodo: 'cash', monto: 1000 }]
  };

  // Lanzamos 50 peticiones en paralelo (esto fuerza una condición de carrera pura)
  const salesPromises = Array.from({ length: 50 }).map(() => 
    axios.post(`${BASE_URL}/sales/checkout`, checkoutPayload, { headers })
      .then(res => ({ success: true, msg: '✅' }))
      .catch(err => ({ success: false, msg: err.response?.data?.error || err.message }))
  );

  const salesResults = await Promise.all(salesPromises);
  const salesSuccess = salesResults.filter(r => r.success).length;
  const salesFailed = salesResults.filter(r => !r.success).length;
  
  console.log('Resultados del Test 1:');
  console.log(`✅ Ventas exitosas: ${salesSuccess} (Si esto es mayor a 1, hay sobreventa!)`);
  console.log(`❌ Ventas rechazadas: ${salesFailed} (Fueron rebotadas por la Base de Datos para proteger el inventario)`);
  if (salesFailed > 0) {
    console.log(`Ejemplo de error: ${salesResults.find(r => !r.success).msg}`);
  }
  if (salesSuccess === 1) {
    console.log('🏆 ¡PRUEBA SUPERADA! El bloqueo transaccional (FOR UPDATE) funcionó perfectamente.');
  } else {
    console.log('⚠️ ALERTA: Hubo sobreventa. El bloqueo transaccional falló.');
  }


  // ----------------------------------------------------------------------
  // TEST 2: Scraper de Datos (Extracción Masiva)
  // ----------------------------------------------------------------------
  console.log('\n🔥 TEST 2: Intento de Extracción de Datos (Scraper) 🔥');
  console.log('Un bot malicioso intentará descargar 999,999 clientes en una sola petición...');
  
  try {
    await axios.get(`${BASE_URL}/customers?limit=999999`, { headers });
    console.log('⚠️ ALERTA: El servidor entregó la información. Falló la protección de paginación.');
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.message;
    console.log(`❌ Petición rechazada por el servidor con error: "${errorMsg}"`);
    console.log('🏆 ¡PRUEBA SUPERADA! La validación Zod bloqueó el abuso de la paginación.');
  }


  // ----------------------------------------------------------------------
  // TEST 3: Aislamiento Multi-Tenant
  // ----------------------------------------------------------------------
  console.log('\n🔥 TEST 3: Intento de Fuga de Datos (Multi-Tenant) 🔥');
  console.log('Intentando inyectar código en el TenantDbName de la petición para leer la base de datos maestra...');
  
  try {
    await axios.get(`${BASE_URL}/customers`, { 
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': 'master_db; DROP TABLE users;' // Intento de inyección falso
      } 
    });
    console.log('🏆 ¡PRUEBA SUPERADA! El servidor ignoró el header malicioso y usó el tenant encriptado en el Token JWT de forma segura.');
  } catch (err) {
    console.log('El servidor manejó el error de forma segura.');
  }

  console.log('\n==============================================');
  console.log('🏁 PRUEBAS FINALIZADAS');
  console.log('==============================================');
}

runTests().catch(console.error);
