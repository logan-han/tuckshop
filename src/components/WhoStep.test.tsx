import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Student } from '../api/types';
import WhoStep from './WhoStep';

const lunch = {
  supplierServiceKey: 'lunch',
  supplierServiceName: 'Lunch',
  supplierKey: 'canteen',
  supplierSiteKey: 'site',
  supplierSiteTimeRegionKey: 'melbourne',
};
const frenchDay = {
  ...lunch,
  supplierServiceKey: 'french',
  supplierServiceName: 'Junior School French Day ',
};

const student: Student = {
  studentKey: 'student-1',
  studentId: 1,
  isClassValid: true,
  studentFirstName: 'Sam',
  studentLastName: 'Example',
  schoolKey: 'school-1',
  schoolName: 'Example Grammar',
  schoolSiteKey: 'site-1',
  services: [lunch, frenchDay],
};

describe('WhoStep', () => {
  it('shows one chip per student and the services as a separate choice', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <WhoStep
        students={[student]}
        student={student}
        service={lunch}
        wallet={null}
        onChoose={onChoose}
        onContinue={() => {}}
      />,
    );

    const students = screen.getByRole('group', { name: 'Student' });
    expect(students.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Sam/ })).toHaveAttribute('aria-pressed', 'true');

    const services = screen.getByRole('group', { name: 'Order from' });
    expect(services.querySelectorAll('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Junior School French Day' }));
    expect(onChoose).toHaveBeenCalledWith(student, frenchDay);
  });

  it('describes each service the way the canteen does and passes the choice up', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <WhoStep
        students={[student]}
        available={[
          {
            supplierServiceKey: 'lunch',
            serviceName: 'Lunch',
            cutOffTime: '2026-10-08T08:30:00',
            nextOrderFulfillmentDate: '2026-10-08T12:40:00',
            description: 'Order by 8.30am',
            supplierKey: 'canteen',
            schoolKey: 'school-1',
            supplierDistributionTimeKey: 'dist',
          },
        ]}
        student={null}
        service={null}
        wallet={{
          accountKey: 'account-1',
          availableBalance: 12.44,
          defaultPaymentMethodName: 'Credit_Card',
          defaultPaymentMethodReference: '4111111111111234',
          topUpAmountOptions: [],
        }}
        onChoose={onChoose}
        onContinue={() => {}}
      />,
    );

    // No student is chosen yet, so there is nothing to pick a service for.
    expect(screen.queryByRole('group', { name: 'Order from' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Wallet balance $12.44, top-ups from Credit Card ending 1234.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sam/ }));
    expect(onChoose).toHaveBeenCalledWith(student, lunch);
  });

  it('shows the canteen wording against the service it belongs to', () => {
    render(
      <WhoStep
        students={[student]}
        available={[
          {
            supplierServiceKey: 'french',
            serviceName: 'French Day',
            cutOffTime: '2026-10-08T08:30:00',
            nextOrderFulfillmentDate: '2026-10-08T12:40:00',
            description: 'One-off, order by Friday',
            supplierKey: 'canteen',
            schoolKey: 'school-1',
            supplierDistributionTimeKey: 'dist',
          },
        ]}
        student={student}
        service={lunch}
        wallet={null}
        onChoose={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByText('One-off, order by Friday')).toBeInTheDocument();
    expect(screen.queryByText(/Wallet balance/)).not.toBeInTheDocument();
  });

  it('says so when the account has no student to order for', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <WhoStep
        students={[]}
        student={null}
        service={null}
        wallet={null}
        onChoose={() => {}}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText(/No students with a food service are linked/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Student' }).querySelectorAll('button')).toHaveLength(
      0,
    );

    await user.click(screen.getByRole('button', { name: 'Choose the days' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('moves on once a student and a service are both chosen', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <WhoStep
        students={[student]}
        student={student}
        service={lunch}
        wallet={null}
        onChoose={() => {}}
        onContinue={onContinue}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose the days' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('hides the service choice when there is only one', () => {
    const single = { ...student, services: [lunch] };
    render(
      <WhoStep
        students={[single]}
        student={null}
        service={null}
        wallet={null}
        onChoose={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Order from' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose the days' })).toBeDisabled();
  });
});
