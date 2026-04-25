import { createAppointment, updateAppointment } from '../data/repositories/appointment.repository';
import { initializeStore } from '../data/schema';

async function testValidation() {
  console.log('--- Iniciando prueba de validación ---');
  
  try {
    await initializeStore();
    const userId = 'usr_demo_001';
    
    // 1. Probar CREACIÓN de cita futura completada
    console.log('\n1. Probando creación de cita futura como "completada"...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    try {
      await createAppointment(userId, {
        customerName: 'Test Future',
        serviceName: 'Test Service',
        durationMin: 30,
        priceCents: 1000,
        date: dateStr,
        time: '10:00',
        status: 'completed'
      });
      console.error('❌ ERROR: La cita futura se creó como completada (no debería)');
    } catch (error: any) {
      console.log('✅ ÉXITO: Capturado el error esperado:', error.message);
    }

    // 2. Probar ACTUALIZACIÓN de cita futura a "completada"
    console.log('\n2. Probando actualización de cita futura a "completada"...');
    // Primero creamos una como pendiente
    const appt = await createAppointment(userId, {
      customerName: 'Test Update',
      serviceName: 'Test Service',
      durationMin: 30,
      priceCents: 1000,
      date: dateStr,
      time: '11:00',
      status: 'scheduled'
    });
    
    if (appt) {
      try {
        await updateAppointment(userId, appt.id, { status: 'completed' });
        console.error('❌ ERROR: La cita futura se pudo marcar como completada (no debería)');
      } catch (error: any) {
        console.log('✅ ÉXITO: Capturado el error esperado:', error.message);
      }
    }

    // 3. Probar ACTUALIZACIÓN de cita pasada a "completada"
    console.log('\n3. Probando actualización de cita pasada a "completada" (debería funcionar)...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDateStr = yesterday.toISOString().split('T')[0];
    
    const pastAppt = await createAppointment(userId, {
      customerName: 'Test Past',
      serviceName: 'Test Service',
      durationMin: 30,
      priceCents: 1000,
      date: pastDateStr,
      time: '10:00',
      status: 'scheduled'
    });

    if (pastAppt) {
      try {
        await updateAppointment(userId, pastAppt.id, { status: 'completed' });
        console.log('✅ ÉXITO: La cita pasada se marcó como completada correctamente.');
      } catch (error: any) {
        console.error('❌ ERROR: No se pudo completar la cita pasada:', error.message);
      }
    }

  } catch (error) {
    console.error('Error general en la prueba:', error);
  } finally {
    process.exit(0);
  }
}

testValidation();
