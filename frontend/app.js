// ============================================================
// EMPODÉRATE VECINO — app.js
// El cliente se llama 'sb' para NO chocar con el global
// 'supabase' que crea la librería (ese fue el error original).
// ============================================================
const SUPABASE_URL = 'https://dmakxahqguexhbmoenyo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_RNVsXFDbqTieM9YkOG02bw_s5KWaew_';

let sb = null;
let configError = '';

// Instancias de gráficos FUERA del estado reactivo de Alpine
let chartHoursInstance = null;
let chartAttInstance = null;

// URL pública de la imagen de firma (Storage). Vacío = no mostrar firma aún.
const SIGNER_PHOTO_URL = '';

// DEBUG: logs en consola para diagnosticar
const DEBUG = true;
function log(...args) { if (DEBUG) console.log('[EV]', ...args); }

(function initClient() {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    configError = '⚠️ No se pudo cargar la librería de Supabase.';
    return;
  }
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    configError = '⚠️ Error al conectar con Supabase: ' + e.message;
  }
})();

function app() {
  return {
    ready: false, session: null, profile: null, configError: configError,
    email: '', password: '', loading: false, errorMsg: '',
    infoMsg: '', forgotLoading: false,
    forgotMode: false,
    showReset: false, newPass: '', newPass2: '', resetMsg: '',
    commissions: [], activities: [], volunteers: [], hours: [], subs: [],
    view: 'vol',
    form: { volunteer_id: '', attended: null, activity_id: '', entry_date: '', hours: '', description: '', justified: null, justification: '' },
    notice: '', noticeType: 'ok',
    today: new Date().toISOString().slice(0, 10),
    fullForm: false,
    personForm: { id: null, nombres: '', apellidos: '', dni: '', commission_id: '', internal_role: '', city: '', birth_date: '', phone: '', email: '', career: '', institution: '', education_level: '', works: '', allergies: '', insurance: '', emergency_contact: '', emergency_relationship: '', emergency_phone: '', hobbies: '', pets: '', admission_date: '', notes: '', photo_url: '', department_id: null, province_id: null, district_id: null, city_foreign: '', is_foreign: false },
    certForm: { commission_id: '', person_id: '', start_date: '', end_date: '' },
    certPreview: null,
    pageVol: 1, pageHours: 1, pageSize: 15,
    filterCommission: '',
    filterSearch: '',
    attFilter: { commission_id: '', from: '', to: '' },
    attendanceData: [],
    hourFilter: { commission_id: '', from: '', to: '' },
    chartMode: 'comision',
    membershipHistory: [],

    // Ubigeo
    ubigeoDepartamentos: [],
    ubigeoProvincias: [],
    ubigeoDistritos: [],

    signerName: 'Heydi Alanya Camasca',
    signerRole: 'Coordinadora de RRHH y Legal',
    subAccounts: [],
    hourEdit: null,
    hourForm: { id: '', activity_id: '', entry_date: '', hours: '', description: '' },

    get myRole() { return this.profile ? this.profile.app_role : ''; },
    get myCommissions() { return (this.profile && this.profile.commission_roles) ? this.profile.commission_roles : []; },
    get myCommission() { return this.myCommissions.length ? this.myCommissions[0] : null; },
    get canWrite() {
      if (this.myRole === 'rrhh') return true;
      return this.myCommissions.some(cr => cr.can_write);
    },
    get activeVols() { return this.volunteers.filter(v => v.status === 'activo'); },
    get bajas() { return this.volunteers.filter(v => v.status === 'baja'); },

    get regVols() {
      if (this.myCommission) return this.activeVols.filter(v => v.commission_id === this.myCommission.commission_id);
      return this.activeVols;
    },

    get pagedVols() {
      const filtered = this.filteredVols;
      const s = (this.pageVol - 1) * this.pageSize;
      return filtered.slice(s, s + this.pageSize);
    },
    get totalPagesVols() {
      return Math.max(1, Math.ceil(this.filteredVols.length / this.pageSize));
    },
    get filteredVols() {
      let list = this.volunteers.filter(v => v.status !== 'eliminado');
      if (this.filterCommission) {
        list = list.filter(v => v.commission_id === this.filterCommission);
      }
      if (this.filterSearch.trim()) {
        const q = this.filterSearch.trim().toLowerCase();
        list = list.filter(v =>
          (v.nombres + ' ' + v.apellidos).toLowerCase().includes(q) ||
          (v.email || '').toLowerCase().includes(q) ||
          (v.dni || '').includes(q)
        );
      }
      return list;
    },
    get filteredHours() {
      let list = this.hours;
      if (this.hourFilter.commission_id) {
        list = list.filter(h => h.commission_id === this.hourFilter.commission_id);
      }
      if (this.hourFilter.from) {
        list = list.filter(h => h.entry_date >= this.hourFilter.from);
      }
      if (this.hourFilter.to) {
        list = list.filter(h => h.entry_date <= this.hourFilter.to);
      }
      return list;
    },
    get pagedHours() { 
      const filtered = this.filteredHours;
      const s = (this.pageHours - 1) * this.pageSize; 
      return filtered.slice(s, s + this.pageSize); 
    },
    get totalPagesHours() { return Math.max(1, Math.ceil(this.filteredHours.length / this.pageSize)); },
    get certPeople() {
      const base = this.volunteers.filter(v => v.status !== 'eliminado');
      if (!this.certForm.commission_id) return base;
      return base.filter(v => v.commission_id === this.certForm.commission_id);
    },
    get certHasHours() {
      const f = this.certForm;
      if (!f.person_id || !f.start_date || !f.end_date) return false;
      return this.hours.some(h => h.volunteer_id === f.person_id && h.status === 'activo' && h.entry_date >= f.start_date && h.entry_date <= f.end_date);
    },

    get passwordChecks() {
      const pass = this.newPass;
      return {
        length: pass.length >= 8,
        upper: /[A-Z]/.test(pass),
        lower: /[a-z]/.test(pass),
        number: /[0-9]/.test(pass),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass),
        match: pass === this.newPass2 && pass.length > 0
      };
    },
    get isPasswordValid() {
      const c = this.passwordChecks;
      return c.length && c.upper && c.lower && c.number && c.special && c.match;
    },

    get isCoordView() {
      if (this.myRole === 'coordinador' || this.myRole === 'subcoordinador') return true;
      return this.myCommissions.some(cr => cr.role_type === 'coordinador' || cr.role_type === 'subcoordinador');
    },

    get isCoordinator() {
      if (this.myRole === 'coordinador') return true;
      return this.myCommissions.some(cr => cr.role_type === 'coordinador');
    },

    async init() {
      const bm = document.getElementById('boot-msg');
      if (bm) bm.remove();
      this.ready = true;
      if (!sb) return;
      try {
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
          this.showReset = true;
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else if (hash.includes('error=')) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
          this.errorMsg = '⚠️ El enlace de recuperación expiró o ya fue utilizado. Solicita uno nuevo desde "¿Olvidaste tu contraseña?" y usa solo el ÚLTIMO correo recibido.';
        }

        const { data } = await sb.auth.getSession();
        if (data.session && !this.showReset) {
          this.session = data.session;
          await this.loadProfile();
          if (this.profile) await this.loadPanel();
        }

        sb.auth.onAuthStateChange(async (event, session) => {
          this.session = session;
          if (event === 'PASSWORD_RECOVERY') { this.showReset = true; return; }
          if (session) { await this.loadProfile(); if (this.profile) await this.loadPanel(); }
          else { this.profile = null; }
        });
      } catch (e) {
        console.error('Error init:', e);
        this.configError = '⚠️ Error de sesión: ' + e.message;
      }
    },

    async login() {
      if (!sb) { this.errorMsg = this.configError || '⚠️ Cliente Supabase no disponible.'; return; }
      this.loading = true; this.errorMsg = '';
      try {
        const { data, error } = await sb.auth.signInWithPassword({
          email: this.email.trim().toLowerCase(),
          password: this.password,
        });
        if (error) throw error;
        this.session = data.session;
        await this.loadProfile();
        if (!this.profile) {
          await sb.auth.signOut(); this.session = null;
          this.errorMsg = 'Tu usuario no está vinculado al sistema. Contacta a RRHH.';
          return;
        }
        if (!this.profile.is_active) {
          await sb.auth.signOut(); this.session = null; this.profile = null;
          this.errorMsg = 'Tu usuario está desactivado. Contacta a RRHH.';
          return;
        }
        this.email = ''; this.password = '';
        await this.loadPanel();
      } catch (err) {
        console.error('Error login:', err);
        this.errorMsg = (err.message || '').includes('Invalid login credentials')
          ? 'Correo o contraseña incorrectos.'
          : (err.message || 'Error al iniciar sesión.');
      } finally { this.loading = false; }
    },

    async loadProfile() {
      if (!sb || !this.session || !this.session.user) return;

      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', this.session.user.id)
        .single();
      if (error || !data) { console.warn('Perfil no encontrado:', error); this.profile = null; return; }

      let crs = [];
      if (data.person_id) {
        const r = await sb
          .from('commission_roles')
          .select('commission_id, role_type, can_write, commissions(id, name)')
          .eq('person_id', data.person_id);
        crs = r.data || [];
      }
      if (data.commission_id && !crs.length) {
        const c = await sb.from('commissions').select('id, name').eq('id', data.commission_id).single();
        crs = [{
          commission_id: data.commission_id,
          role_type: data.app_role,
          can_write: (data.app_role === 'coordinador' || data.app_role === 'rrhh' || (data.app_role === 'subcoordinador' && data.can_write)),
          commissions: c.data
        }];
      }
      data.commission_roles = crs;
      this.profile = data;
    },

    async logout() {
      if (sb) await sb.auth.signOut();
      this.session = null; this.profile = null;
      this.volunteers = []; this.hours = []; this.subs = [];
      this.view = 'vol';
    },

    async forgot() {
      if (!sb) { this.errorMsg = this.configError || 'Cliente no disponible.'; return; }
      const correo = this.email.trim().toLowerCase();
      if (!correo) {
        this.errorMsg = 'Escribe tu correo primero.';
        return;
      }
      this.forgotLoading = true;
      this.errorMsg = '';
      const { error } = await sb.auth.resetPasswordForEmail(correo, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      this.forgotLoading = false;
      if (error) {
        this.errorMsg = error.message;
        return;
      }
      this.forgotMode = false;
      this.infoMsg = '📧 Enlace enviado a tu correo (revisa también spam). Al abrirlo podrás crear tu nueva contraseña.';
    },

    cancelForgot() {
      this.forgotMode = false;
      this.errorMsg = '';
    },

    async saveNewPassword() {
      if (!this.isPasswordValid) return;

      this.resetMsg = '';
      const { error } = await sb.auth.updateUser({ password: this.newPass });

      if (error) {
        this.resetMsg = error.message;
        return;
      }

      this.showReset = false;
      this.newPass = '';
      this.newPass2 = '';
      this.resetMsg = '';

      await sb.auth.signOut();
      this.session = null;
      this.profile = null;
      this.infoMsg = '✅ Contraseña actualizada correctamente. Ingresa con tu nueva contraseña.';

      setTimeout(() => {
        this.session = null;
        this.profile = null;
      }, 100);
    },

    async loadUbigeoDepartamentos() {
      const { data, error } = await sb.from('ubigeo').select('departamento').order('departamento');
      if (error) {
        console.error('[EV] Error cargando ubigeo:', error);
        this.notify('Error cargando ubigeo: ' + error.message, 'err');
        return;
      }
      this.ubigeoDepartamentos = [...new Set((data || []).map(u => u.departamento))].sort();
      log('Departamentos cargados:', this.ubigeoDepartamentos.length);
    },

    async loadUbigeoProvincias(departamento) {
      if (!departamento) { this.ubigeoProvincias = []; return; }
      const { data } = await sb.from('ubigeo').select('provincia').eq('departamento', departamento).order('provincia');
      const unique = [...new Set(data.map(u => u.provincia))].sort();
      this.ubigeoProvincias = unique;
    },

    async loadUbigeoDistritos(departamento, provincia) {
      if (!departamento || !provincia) { this.ubigeoDistritos = []; return; }
      const { data } = await sb.from('ubigeo')
        .select('id, distrito')
        .eq('departamento', departamento)
        .eq('provincia', provincia)
        .order('distrito');
      this.ubigeoDistritos = data || [];
    },

    async onDepartmentChange() {
      this.personForm.province_id = null;
      this.personForm.district_id = null;
      this.ubigeoProvincias = [];
      this.ubigeoDistritos = [];
      const dep = this.ubigeoDepartamentos.find(d => d === this.personForm.department_name);
      if (dep) await this.loadUbigeoProvincias(dep);
    },

    async onProvinceChange() {
      this.personForm.district_id = null;
      this.ubigeoDistritos = [];
      const prov = this.ubigeoProvincias.find(p => p === this.personForm.province_name);
      if (prov && this.personForm.department_name) {
        await this.loadUbigeoDistritos(this.personForm.department_name, prov);
      }
    },

    newPerson() {
      this.personForm = { id: null, nombres: '', apellidos: '', dni: '', commission_id: '', internal_role: '', city: '', birth_date: '', phone: '', email: '', career: '', institution: '', education_level: '', works: '', allergies: '', insurance: '', emergency_contact: '', emergency_relationship: '', emergency_phone: '', hobbies: '', pets: '', admission_date: this.today, notes: '', photo_url: '', department_id: null, province_id: null, district_id: null, city_foreign: '', is_foreign: false, department_name: '', province_name: '', district_name: '' };
      this.fullForm = false;
      this.showPersonForm = true;
      this.loadUbigeoDepartamentos();
    },

    async editPerson(v) {
      this.personForm = {
        id: v.id, nombres: v.nombres, apellidos: v.apellidos, dni: v.dni || '',
        commission_id: v.commission_id || '', internal_role: v.internal_role || '',
        city: v.city || '', birth_date: v.birth_date || '', phone: v.phone || '',
        email: v.email || '', career: v.career || '', institution: v.institution || '',
        education_level: v.education_level || '', works: v.works || '',
        allergies: v.allergies || '', insurance: v.insurance || '',
        emergency_contact: v.emergency_contact || '', emergency_relationship: v.emergency_relationship || '',
        emergency_phone: v.emergency_phone || '', hobbies: v.hobbies || '', pets: v.pets || '',
        admission_date: v.admission_date || '', notes: v.notes || '', photo_url: v.photo_url || '',
        department_id: v.department_id || null, province_id: v.province_id || null, district_id: v.district_id || null,
        city_foreign: v.city_foreign || '', is_foreign: !!v.city_foreign,
        department_name: '', province_name: '', district_name: ''
      };
      this.fullForm = true;
      this.showPersonForm = true;
      await this.loadUbigeoDepartamentos();
      
      if (v.district_id) {
        const { data: dist } = await sb.from('ubigeo').select('departamento, provincia, distrito').eq('id', v.district_id).single();
        if (dist) {
          this.personForm.department_name = dist.departamento;
          this.personForm.province_name = dist.provincia;
          this.personForm.district_name = dist.distrito;
          await this.loadUbigeoProvincias(dist.departamento);
          await this.loadUbigeoDistritos(dist.departamento, dist.provincia);
        }
      }
    },

    async savePerson() {
      const f = this.personForm;
      if (!f.nombres.trim() || !f.apellidos.trim()) { this.notify('Nombres y apellidos son obligatorios.', 'err'); return; }
      if (!f.commission_id) { this.notify('Selecciona una comisión.', 'err'); return; }
      if (f.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(f.email)) { this.notify('Correo con formato inválido.', 'err'); return; }
      
      let department_id = null, province_id = null, district_id = null, city_foreign = null;
      if (f.is_foreign) {
        city_foreign = f.city_foreign || null;
      } else if (f.district_name) {
        const { data: dist } = await sb.from('ubigeo')
          .select('id')
          .eq('departamento', f.department_name)
          .eq('provincia', f.province_name)
          .eq('distrito', f.district_name)
          .single();
        if (dist) district_id = dist.id;
      }
      
      const payload = {
        nombres: f.nombres.trim(), apellidos: f.apellidos.trim(),
        dni: f.dni.trim() || null, commission_id: f.commission_id,
        internal_role: f.internal_role.trim() || null, city: f.city.trim() || null,
        birth_date: f.birth_date || null, phone: f.phone.trim() || null,
        email: f.email.trim().toLowerCase() || null, career: f.career.trim() || null,
        institution: f.institution.trim() || null, education_level: f.education_level.trim() || null,
        works: f.works.trim() || null, allergies: f.allergies.trim() || null,
        insurance: f.insurance.trim() || null, emergency_contact: f.emergency_contact.trim() || null,
        emergency_relationship: f.emergency_relationship.trim() || null,
        emergency_phone: f.emergency_phone.trim() || null, hobbies: f.hobbies.trim() || null,
        pets: f.pets.trim() || null, admission_date: f.admission_date || null,
        notes: f.notes || null, updated_at: new Date().toISOString(),
        photo_url: f.photo_url || null,
        department_id: null, province_id: null, district_id: district_id, city_foreign: city_foreign
      };
      let error = null;
      if (f.id) {
        ({ error } = await sb.from('people').update(payload).eq('id', f.id));
      } else {
        payload.status = 'activo';
        ({ error } = await sb.from('people').insert(payload));
      }
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.showPersonForm = false;
      this.notify(f.id ? '✅ Persona actualizada.' : '✅ Alta registrada.', 'ok');
      await this.refresh();
    },

    async darBaja(v) {
      const fecha = prompt('Fecha de baja (AAAA-MM-DD):', this.today);
      if (!fecha) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { this.notify('Fecha inválida. Usa AAAA-MM-DD.', 'err'); return; }
      const motivo = prompt('Motivo de la baja (obligatorio):');
      if (!motivo) { this.notify('La baja requiere motivo.', 'err'); return; }
      const { error } = await sb.from('people').update({
        status: 'baja', departure_date: fecha, departure_reason: motivo,
        updated_at: new Date().toISOString()
      }).eq('id', v.id);
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      const { error: eh } = await sb.from('membership_history').insert({
        person_id: v.id,
        admission_date: v.admission_date || fecha,
        departure_date: fecha,
        departure_reason: motivo,
        commission_id: v.commission_id,
        created_by: this.profile.id
      });
      if (eh) { this.notify('✅ Baja registrada, pero el historial falló: ' + eh.message, 'err'); }
      else { this.notify('✅ Baja registrada. El periodo quedó en el historial.', 'ok'); }
      await this.refresh();
    },

    async reactivar(v) {
      const nueva = prompt('Nueva fecha de ingreso del reingreso (AAAA-MM-DD):', this.today);
      if (!nueva) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nueva)) { this.notify('Fecha inválida. Usa AAAA-MM-DD.', 'err'); return; }
      const { error } = await sb.from('people').update({
        status: 'activo', admission_date: nueva, departure_date: null, departure_reason: null,
        updated_at: new Date().toISOString()
      }).eq('id', v.id);
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.notify('✅ Reactivado con nueva fecha de ingreso ' + nueva + '. El periodo anterior queda en el historial.', 'ok');
      await this.refresh();
    },

    async softDeletePerson(v) {
      if (!confirm('¿Eliminar a ' + this.fullName(v) + ' de las listas? Sus registros históricos (horas, asistencias) se conservan para auditoría.')) return;
      const { error } = await sb.from('people').update({
        status: 'eliminado', updated_at: new Date().toISOString()
      }).eq('id', v.id);
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.notify('✅ Miembro marcado como eliminado (no aparece en listas, historial intacto).', 'ok');
      await this.refresh();
    },

    certName(p) { return p ? (p.nombres + ' ' + p.apellidos) : ''; },

    onCertPerson() {
      const p = this.volunteers.find(v => v.id === this.certForm.person_id);
      if (!p) return;
      this.certForm.start_date = p.admission_date || '';
      this.certForm.end_date = p.departure_date || this.today;
    },

    certHtml() {
      const c = this.certPreview;
      if (!c) return '';
      const p = c.person;
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      const d = new Date();
      const fmt = (iso) => { if (!iso) return '___'; const q = iso.split('-'); return q[2] + ' de ' + meses[parseInt(q[1], 10) - 1] + ' de ' + q[0]; };
      const dni = p.dni ? ', identificado(a) con DNI ' + p.dni : '';
      const horas = (c.total_hours > 0) ? ' Durante dicho periodo acumuló <strong>' + c.total_hours + ' horas</strong> de voluntariado verificadas en este sistema.' : '';
      return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:800px;margin:0 auto;padding:24px;">' +
        '<div style="text-align:center;margin-bottom:16px;"><img src="assets/logo.png" style="height:80px;" onerror="this.style.display=\'none\'"/></div>' +
        '<h1 style="text-align:center;letter-spacing:3px;">CONSTANCIA</h1>' +
        '<p style="text-align:justify;line-height:1.7;">La organización juvenil <strong>EMPODÉRATE VECINO</strong>, acreditada formalmente ante la Secretaría Nacional de la Juventud del Ministerio de Educación mediante la Constancia <strong>No. 00227-2022-MINEDU/DM-SENAJU</strong>, certifica que el(la) señor(a) <strong>' + this.certName(p) + '</strong>' + dni + ', ha desempeñado labores de voluntariado en nuestra organización desde el <strong>' + fmt(c.start_date) + '</strong> hasta el <strong>' + fmt(c.end_date) + '</strong>, ocupando el puesto de <strong>' + (p.internal_role || 'Voluntario(a)') + '</strong>.' + horas + '</p>' +
        '<p style="text-align:justify;line-height:1.7;">Se expide la presente constancia a solicitud del interesado, a los ' + String(d.getDate()).padStart(2, '0') + ' días del mes de ' + meses[d.getMonth()] + ' de ' + d.getFullYear() + '.</p>' +
        '<p style="text-align:justify;line-height:1.7;">Para cualquier confirmación o ampliación de información, por favor comuníquese al correo electrónico empoderatevecino@gmail.com.</p>' +
        '<p style="margin-top:32px;">Atentamente,</p>' +
        '<div style="margin-top:56px;width:300px;text-align:center;">' +
          (SIGNER_PHOTO_URL ? '<img src="' + SIGNER_PHOTO_URL + '" style="height:60px;margin:0 auto 4px;" onerror="this.style.display=\'none\'"/>' : '') +
          '<div style="border-top:1px solid #334155;padding-top:8px;"><strong>' + this.signerName + '</strong><br/>' + this.signerRole + '<br/>EMPODÉRATE VECINO</div>' +
        '</div>' +
        '<div style="margin-top:56px;border-top:1px solid #cbd5e1;padding-top:12px;text-align:center;font-size:12px;color:#475569;">@ong.empoderatevecino · 📧 empoderatevecino@gmail.com · 🌐 www.empoderatevecino.com<br/>Potenciando comunidades para una transformación social duradera.</div>' +
        '</div>';
    },

    async generateCert() {
      const f = this.certForm;
      if (!f.person_id || !f.start_date || !f.end_date) { this.notify('Selecciona persona y rango de fechas.', 'err'); return; }
      if (f.end_date < f.start_date) { this.notify('El fin no puede ser anterior al inicio.', 'err'); return; }
      const person = this.volunteers.find(v => v.id === f.person_id);
      const total = this.hours
        .filter(h => h.volunteer_id === f.person_id && h.status === 'activo' && h.entry_date >= f.start_date && h.entry_date <= f.end_date)
        .reduce((s, h) => s + Number(h.hours), 0);
      const year = new Date().getFullYear();
      const { count } = await sb.from('certificates').select('*', { count: 'exact', head: true });
      const code = 'EV-' + year + '-' + String((count || 0) + 1).padStart(4, '0');
      const payload = { person_id: f.person_id, start_date: f.start_date, end_date: f.end_date, total_hours: total, certificate_code: code, issuer_profile: this.profile.id };
      const { error } = await sb.from('certificates').insert(payload);
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.certPreview = Object.assign({}, payload, { person: person });
      this.notify('✅ Constancia ' + code + ' generada.', 'ok');
    },

    printCert() {
      const html = this.certHtml();
      if (!html) return;
      const w = window.open('', '_blank');
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Constancia</title></head><body>' + html + '</body></html>');
      w.document.close();
      w.focus();
      w.print();
    },

    async loadPanel() {
      if (!this.profile) return;
      const [{ data: c }, { data: a }] = await Promise.all([
        sb.from('commissions').select('*').order('name'),
        sb.from('activities').select('*').eq('active', true).order('name')
      ]);
      this.commissions = c || [];
      this.activities = a || [];
      await this.loadUbigeoDepartamentos();

      const { data: sg } = await sb.from('people')
        .select('nombres, apellidos, internal_role')
        .ilike('internal_role', '%RRHH%')
        .ilike('internal_role', '%coordinador%')
        .order('admission_date', { ascending: false })
        .limit(1);
      if (sg && sg.length) {
        this.signerName = sg[0].nombres + ' ' + sg[0].apellidos;
        this.signerRole = sg[0].internal_role;
      }

      await this.refresh();
      await this.loadAttendance();
    },

    async refresh() {
      const [{ data: v }, { data: h }] = await Promise.all([
        sb.from('people').select('*').order('apellidos'),
        sb.from('hour_entries')
          .select('*, people(nombres, apellidos), activities(name)')
          .order('created_at', { ascending: false })
      ]);
      this.volunteers = v || [];
      this.hours = h || [];
      if (this.myCommission) {
        const { data: s } = await sb
          .from('commission_roles')
          .select('*, people(nombres, apellidos)')
          .eq('commission_id', this.myCommission.commission_id)
          .eq('role_type', 'subcoordinador');
        this.subs = s || [];

        const { data: sa } = await sb.from('profiles')
          .select('id, email, can_write')
          .eq('app_role', 'subcoordinador')
          .eq('commission_id', this.myCommission.commission_id);
        this.subAccounts = sa || [];
      }
      const { data: mh } = await sb.from('membership_history')
        .select('*, people(nombres, apellidos)')
        .order('departure_date', { ascending: false });
      this.membershipHistory = mh || [];

      if (this.view === 'rep') this.$nextTick(() => this.renderChart());
      if (this.view === 'att') this.$nextTick(() => this.loadAttendance());
    },

    async submitHour() {
      this.notice = '';
      const f = this.form;
      const v = this.volunteers.find(x => x.id === f.volunteer_id);
      if (!v) { this.notify('Selecciona un voluntario.', 'err'); return; }
      if (!f.entry_date) { this.notify('Indica la fecha de la reunión/actividad.', 'err'); return; }
      if (!f.attended) { this.notify('Marca si asistió o no asistió.', 'err'); return; }

      if (f.attended === 'si') {
        if (!f.activity_id || !f.hours) { this.notify('Completa actividad y horas.', 'err'); return; }
        const dup = this.hours.find(h => h.volunteer_id === v.id && h.entry_date === f.entry_date && h.activity_id === f.activity_id && h.status === 'activo');
        if (dup && !confirm('Ya existe un registro activo de ' + this.fullName(v) + ' en esa fecha y actividad. ¿Registrar de todos modos?')) return;

        const { error } = await sb.rpc('register_hour', {
          p_volunteer_id: v.id, p_activity_id: f.activity_id, p_entry_date: f.entry_date,
          p_hours: parseFloat(f.hours), p_description: f.description || null
        });
        if (error) { this.notify('Error: ' + error.message, 'err'); return; }
        const { error: e2 } = await sb.from('attendance').insert({
          person_id: v.id, commission_id: v.commission_id, activity_id: f.activity_id,
          meeting_date: f.entry_date, attended: true, justified: null, justification: null,
          registered_by: this.profile.id
        });
        if (e2) { this.notify('Hora registrada, pero la asistencia falló: ' + e2.message, 'err'); return; }
        this.notify('✅ Hora y asistencia registradas.', 'ok');
      } else {
        if (!f.justified) { this.notify('Indica si la falta fue justificada o injustificada.', 'err'); return; }
        const just = f.justified === 'si';
        const { error } = await sb.from('attendance').insert({
          person_id: v.id, commission_id: v.commission_id, activity_id: null,
          meeting_date: f.entry_date, attended: false, justified: just,
          justification: f.justification || null, registered_by: this.profile.id
        });
        if (error) { this.notify('Error: ' + error.message, 'err'); return; }
        this.notify(just ? '✅ Inasistencia justificada registrada.' : '✅ Inasistencia injustificada registrada.', 'ok');
      }

      this.form = { volunteer_id: '', attended: null, activity_id: '', entry_date: '', hours: '', description: '', justified: null, justification: '' };
      await this.refresh();
      await this.loadAttendance();
    },

    async toggleSubAccount(p) {
      const { error } = await sb.rpc('set_account_write', { p_profile_id: p.id, p_can_write: !p.can_write });
      if (error) { this.notify('Error: ' + error.message, 'err'); }
      else { this.notify('✅ Permiso de cuenta actualizado.', 'ok'); await this.refresh(); }
    },

    openHourEdit(h) {
      this.hourEdit = h.id;
      this.hourForm = { id: h.id, activity_id: h.activity_id, entry_date: h.entry_date, hours: h.hours, description: h.description || '' };
    },
    async saveHourEdit() {
      const f = this.hourForm;
      const { error } = await sb.rpc('edit_hour', {
        p_id: f.id, p_activity_id: f.activity_id, p_entry_date: f.entry_date,
        p_hours: parseFloat(f.hours), p_description: f.description || null
      });
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.hourEdit = null;
      this.notify('✅ Registro corregido.', 'ok');
      await this.refresh();
    },
    async deleteHour(h) {
      if (!confirm('¿Eliminar definitivamente este registro de horas? Quedará en la auditoría.')) return;
      const { error } = await sb.rpc('delete_hour', { p_id: h.id });
      if (error) { this.notify('Error: ' + error.message, 'err'); return; }
      this.notify('✅ Registro eliminado.', 'ok');
      await this.refresh();
    },

    async uploadPhoto(file) {
      if (!file) return;
      const ext = file.name.split('.').pop();
      const path = (this.personForm.id || 'nueva') + '-' + Date.now() + '.' + ext;
      const { error } = await sb.storage.from('fotos').upload(path, file, { upsert: true });
      if (error) { this.notify('Error al subir foto: ' + error.message, 'err'); return; }
      this.personForm.photo_url = sb.storage.from('fotos').getPublicUrl(path).data.publicUrl;
      this.notify('✅ Foto cargada. Recuerda presionar Guardar.', 'ok');
    },

    exportPeopleXLS() {
      if (!window.XLSX) { this.notify('Librería XLS no disponible.', 'err'); return; }
      const rows = this.filteredVols.map(v => ({
        Nombres: v.nombres, Apellidos: v.apellidos, DNI: v.dni || '',
        Comision: this.commissionName(v.commission_id), Rol: v.internal_role || '',
        Departamento: v.department_id ? 'Sí' : '', Provincia: v.province_id ? 'Sí' : '', Distrito: v.district_id ? 'Sí' : '',
        CiudadExtranjera: v.city_foreign || '', FechaNacimiento: v.birth_date || '', Telefono: v.phone || '',
        Correo: v.email || '', Alergias: v.allergies || '', Seguro: v.insurance || '',
        ContactoEmergencia: v.emergency_contact || '', Parentesco: v.emergency_relationship || '',
        TelEmergencia: v.emergency_phone || '', Estudios: v.education_level || '',
        Carrera: v.career || '', Institucion: v.institution || '', Trabaja: v.works || '',
        Hobbies: v.hobbies || '', Mascotas: v.pets || '',
        FechaIngreso: v.admission_date || '', Estado: v.status,
        FechaBaja: v.departure_date || '', MotivoBaja: v.departure_reason || '',
        FotoURL: v.photo_url || '', Observaciones: v.notes || ''
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Personas');
      XLSX.writeFile(wb, 'personas.xlsx');
    },

    downloadHoursTemplate() {
      const rows = this.regVols.map(v => ({
        Correo: v.email || '', Fecha: '', Actividad: '', Horas: '', Descripcion: ''
      }));
      if (!rows.length) rows.push({ Correo: 'voluntario@correo.com', Fecha: '', Actividad: '', Horas: '', Descripcion: '' });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      XLSX.writeFile(wb, 'plantilla_horas.xlsx');
    },

    async importHoursFile(file) {
      if (!file) return;
      try {
        const wb = XLSX.read(await file.arrayBuffer());
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let ok = 0; const errs = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const email = String(r.Correo || '').trim().toLowerCase();
          const v = this.volunteers.find(x => (x.email || '').toLowerCase() === email);
          if (!v) { errs.push('Fila ' + (i + 2) + ': correo no encontrado'); continue; }
          const act = this.activities.find(a => a.name.toLowerCase() === String(r.Actividad || '').trim().toLowerCase());
          if (!act) { errs.push('Fila ' + (i + 2) + ': actividad no existe'); continue; }
          let fecha = r.Fecha;
          if (typeof fecha === 'number') {
            fecha = new Date(Math.round((fecha - 25569) * 86400000)).toISOString().slice(0, 10);
          } else {
            fecha = String(fecha).slice(0, 10);
          }
          const horas = parseFloat(r.Horas);
          if (!horas) { errs.push('Fila ' + (i + 2) + ': horas inválidas'); continue; }
          const { error } = await sb.rpc('register_hour', {
            p_volunteer_id: v.id, p_activity_id: act.id, p_entry_date: fecha,
            p_hours: horas, p_description: r.Descripcion ? String(r.Descripcion) : null
          });
          if (error) errs.push('Fila ' + (i + 2) + ': ' + error.message); else ok++;
        }
        this.notify('Importación: ' + ok + ' OK' + (errs.length ? ', ' + errs.length + ' con error → ' + errs.slice(0, 3).join(' | ') : ''), errs.length ? 'err' : 'ok');
        await this.refresh();
      } catch (e) {
        this.notify('Error al leer el archivo: ' + e.message, 'err');
      }
    },

    downloadAttTemplate() {
      const rows = this.regVols.map(v => ({
        Correo: v.email || '', Fecha: '', Asistio: '', Justificada: '', Motivo: ''
      }));
      if (!rows.length) rows.push({ Correo: 'voluntario@correo.com', Fecha: '', Asistio: '', Justificada: '', Motivo: '' });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      XLSX.writeFile(wb, 'plantilla_asistencia.xlsx');
    },

    async importAttFile(file) {
      if (!file) return;
      try {
        const wb = XLSX.read(await file.arrayBuffer());
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        let ok = 0; const errs = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const email = String(r.Correo || '').trim().toLowerCase();
          const v = this.volunteers.find(x => (x.email || '').toLowerCase() === email);
          if (!v) { errs.push('Fila ' + (i + 2) + ': correo no encontrado'); continue; }
          let fecha = r.Fecha;
          if (typeof fecha === 'number') fecha = new Date(Math.round((fecha - 25569) * 86400000)).toISOString().slice(0, 10);
          else fecha = String(fecha).slice(0, 10);
          if (!fecha) { errs.push('Fila ' + (i + 2) + ': fecha inválida'); continue; }
          const asistio = String(r.Asistio || '').trim().toLowerCase();
          if (asistio !== 'si' && asistio !== 'no') { errs.push('Fila ' + (i + 2) + ': Asistio debe ser si/no'); continue; }
          let justified = null, justification = null;
          if (asistio === 'no') {
            const just = String(r.Justificada || '').trim().toLowerCase();
            if (just !== 'si' && just !== 'no') { errs.push('Fila ' + (i + 2) + ': Justificada debe ser si/no'); continue; }
            justified = (just === 'si');
            justification = r.Motivo ? String(r.Motivo) : null;
          }
          const { error } = await sb.from('attendance').insert({
            person_id: v.id, commission_id: v.commission_id, activity_id: null,
            meeting_date: fecha, attended: (asistio === 'si'),
            justified: justified, justification: justification,
            registered_by: this.profile.id
          });
          if (error) errs.push('Fila ' + (i + 2) + ': ' + error.message); else ok++;
        }
        this.notify('Importación asistencia: ' + ok + ' OK' + (errs.length ? ', ' + errs.length + ' con error → ' + errs.slice(0, 3).join(' | ') : ''), errs.length ? 'err' : 'ok');
        await this.loadAttendance();
      } catch (e) {
        this.notify('Error al leer el archivo: ' + e.message, 'err');
      }
    },

    async annul(h) {
      const reason = prompt('Motivo de anulación (obligatorio):');
      if (!reason) return;
      const { error } = await sb.rpc('annul_hour', { p_hour_entry_id: h.id, p_reason: reason });
      if (error) { this.notify('Error: ' + error.message, 'err'); }
      else { this.notify('✅ Hora anulada.', 'ok'); await this.refresh(); }
    },

    notify(msg, type) {
      this.notice = msg; this.noticeType = type;
      setTimeout(() => { this.notice = ''; }, 5000);
    },

    commissionName(id) {
      const c = this.commissions.find(x => x.id === id);
      return c ? c.name : '';
    },

    fullName(p) { return p ? (p.apellidos + ', ' + p.nombres) : ''; },

    totalHours(list) {
      return list.filter(h => h.status === 'activo').reduce((s, h) => s + Number(h.hours), 0);
    },

    exportXLS() {
      if (!window.XLSX) { this.notify('Librería XLS no disponible.', 'err'); return; }
      const rows = this.hours.map(h => ({
        Fecha: h.entry_date,
        Voluntario: this.fullName(h.people),
        Comision: this.commissionName(h.commission_id),
        Actividad: h.activities ? h.activities.name : '',
        Horas: Number(h.hours),
        Estado: h.status
      }));
      const ws = window.XLSX.utils.json_to_sheet(rows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Horas');
      window.XLSX.writeFile(wb, 'horas_voluntariado.xlsx');
    },

    exportAttXLS() {
      if (!window.XLSX) { this.notify('Librería XLS no disponible.', 'err'); return; }
      const rows = this.attendanceData.map(a => ({
        Fecha: a.meeting_date,
        Voluntario: this.fullName(a.people),
        Comision: this.commissionName(a.commission_id),
        Actividad: a.activities ? a.activities.name : '',
        Estado: a.attended ? 'Asistió' : (a.justified ? 'Inasistencia justificada' : 'Inasistencia injustificada'),
        Justificacion: a.justification || ''
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
      XLSX.writeFile(wb, 'asistencia.xlsx');
    },

    renderChart() {
      const canvas = document.getElementById('chartHours');
      if (!canvas || !window.Chart) return;
      const activos = this.filteredHours.filter(h => h.status === 'activo');
      const monthsSet = new Set();
      activos.forEach(h => monthsSet.add(h.entry_date.slice(0, 7)));
      const months = Array.from(monthsSet).sort();
      const labels = months.map(m => { const p = m.split('-'); return p[1] + '/' + p[0]; });
      const colors = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#b91c1c'];
      const grupos = {};
      activos.forEach(h => {
        const key = (this.chartMode === 'comision')
          ? (this.commissionName(h.commission_id) || 'Sin comisión')
          : (h.activities ? h.activities.name : 'Otro');
        const m = h.entry_date.slice(0, 7);
        if (!grupos[key]) grupos[key] = {};
        grupos[key][m] = (grupos[key][m] || 0) + Number(h.hours);
      });
      const datasets = Object.keys(grupos).map((g, i) => ({
        label: g,
        data: months.map(m => grupos[g][m] || 0),
        backgroundColor: colors[i % colors.length],
      }));
      const titulo = (this.chartMode === 'comision') ? 'Horas por mes y comisión' : 'Horas por mes y actividad';
      setTimeout(() => {
        if (chartHoursInstance) chartHoursInstance.destroy();
        chartHoursInstance = new window.Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
            plugins: { legend: { position: 'bottom' }, title: { display: true, text: titulo } },
          },
        });
      }, 60);
    },

    onCertCommission() {
      this.certForm.person_id = '';
      this.certForm.start_date = '';
      this.certForm.end_date = '';
      this.certPreview = null;
    },

    async loadAttendance() {
      let q = sb.from('attendance')
        .select('*, people(nombres, apellidos), activities(name)')
        .order('meeting_date', { ascending: false });
      if (this.attFilter.commission_id) q = q.eq('commission_id', this.attFilter.commission_id);
      if (this.attFilter.from) q = q.gte('meeting_date', this.attFilter.from);
      if (this.attFilter.to) q = q.lte('meeting_date', this.attFilter.to);
      const { data, error } = await q;
      this.attendanceData = data || [];
      this.renderAttChart();
    },

    renderAttChart() {
      const canvas = document.getElementById('chartAtt');
      if (!canvas || !window.Chart) return;
      const byCom = {};
      this.attendanceData.forEach(a => {
        const c = this.commissionName(a.commission_id) || 'Sin comisión';
        if (!byCom[c]) byCom[c] = { asistio: 0, inasistio: 0 };
        if (a.attended) byCom[c].asistio++;
        else byCom[c].inasistio++;
      });
      const labels = Object.keys(byCom);
      const colors = ['#16a34a', '#dc2626', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#b91c1c'];
      setTimeout(() => {
        if (chartAttInstance) chartAttInstance.destroy();
        chartAttInstance = new window.Chart(canvas.getContext('2d'), {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{ 
              data: labels.map(l => byCom[l].asistio + byCom[l].inasistio), 
              backgroundColor: colors.slice(0, labels.length) 
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              title: { display: true, text: 'Registros de asistencia por comisión' }
            }
          }
        });
      }, 60);
    },
  };
}